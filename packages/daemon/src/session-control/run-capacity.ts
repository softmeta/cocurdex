import {
  type AgentId,
  type AgentRunLimits,
  decideRunAdmission,
  delegatedRunTimeoutMs,
  isDelegatedSession,
  type RunRecord,
  type SessionRecord,
} from "@cocurdex/shared";
import { RunAdmissionQueue } from "./run-admission-queue";

export interface RunCapacityDeps {
  readLimits(): Promise<AgentRunLimits>;
  activeAgentTypes(): Promise<AgentId[]>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  hasActiveRun(sessionId: string): boolean;
  dispatchQueued(sessionId: string): Promise<unknown>;
  expireRun(sessionId: string, runId: string, reason: string): Promise<void>;
  track(work: Promise<unknown>): void;
  onError(error: unknown): void;
}

export class RunCapacity {
  private readonly queue = new RunAdmissionQueue();
  private readonly deadlines = new Map<string, ReturnType<typeof setTimeout>>();
  private pass: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly deps: RunCapacityDeps) {}

  async mustWait(session: SessionRecord) {
    if (!isDelegatedSession(session)) return false;
    const verdict = decideRunAdmission({
      agentType: session.agentType,
      activeAgentTypes: await this.deps.activeAgentTypes(),
      limits: await this.deps.readLimits(),
    });
    return !verdict.admit;
  }

  hold(sessionId: string) {
    this.queue.enqueue(sessionId);
  }

  isHeld(sessionId: string) {
    return this.queue.isWaiting(sessionId);
  }

  whenAdmitted(sessionId: string) {
    return this.queue.whenAdmitted(sessionId);
  }

  release(sessionId: string, reason: Error) {
    this.queue.cancel(sessionId, reason);
  }

  async armDeadline(session: SessionRecord, runId: string) {
    if (!isDelegatedSession(session)) return;
    const limits = await this.deps.readLimits();
    const timeoutMs = delegatedRunTimeoutMs(limits);
    if (timeoutMs === null || this.closed) return;
    const reason = `Run timed out after ${limits.delegatedRunTimeoutMinutes} minutes`;
    const timer = setTimeout(() => {
      this.deadlines.delete(runId);
      this.deps.track(
        this.deps
          .expireRun(session.id, runId, reason)
          .catch((error: unknown) => this.deps.onError(error)),
      );
    }, timeoutMs);
    timer.unref?.();
    this.deadlines.set(runId, timer);
  }

  onRunEnded(run: RunRecord) {
    const timer = this.deadlines.get(run.id);
    if (timer) clearTimeout(timer);
    this.deadlines.delete(run.id);
    if (this.queue.waiting().length === 0 || this.closed) return;
    this.pass = this.pass
      .then(() => this.admitWaiting())
      .catch((error: unknown) => this.deps.onError(error));
    this.deps.track(this.pass);
  }

  close(reason: Error) {
    this.closed = true;
    for (const timer of this.deadlines.values()) clearTimeout(timer);
    this.deadlines.clear();
    this.queue.cancelAll(reason);
  }

  private async admitWaiting() {
    for (const sessionId of this.queue.waiting()) {
      if (this.closed) return;
      if (this.deps.hasActiveRun(sessionId)) continue;
      const session = await this.deps.getSession(sessionId);
      if (!session || session.archivedAt) {
        this.queue.cancel(sessionId, new Error("Session is gone"));
        continue;
      }
      if (await this.mustWait(session)) continue;
      try {
        await this.deps.dispatchQueued(sessionId);
        this.queue.admitted(sessionId);
      } catch (error) {
        this.queue.cancel(
          sessionId,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }
}

import type {
  AgentEvent,
  AgentId,
  RunRecord,
  RunStatus,
  SessionStatus,
} from "@cocurdex/shared";
import type { SessionTurnOutcome } from "./execution-types";
import { decideRunOutcome, type RunSettlement } from "./run-decisions";

type TerminalRunStatus = Exclude<RunStatus, "running">;

export interface RunStore {
  startRun(run: RunRecord): Promise<RunRecord>;
  finishRun(
    runId: string,
    status: TerminalRunStatus,
    endedAt: string,
    error: string | null,
  ): Promise<RunRecord | null>;
}

export interface SessionRunCoordinatorDeps {
  store: RunStore;
  emit(event: AgentEvent): void;
  afterPersistedEvents<T>(work: () => Promise<T>): Promise<T>;
  onRunSettled(run: RunRecord): void;
  onRunEnded?(run: RunRecord): void;
  now(): string;
  createId(): string;
}

export interface RunHandle {
  runId: string;
  sessionId: string;
  signal: AbortSignal;
}

interface ActiveRun {
  record: RunRecord;
  controller: AbortController;
  providerFailure: string | null;
  lastProviderError: string | null;
  ending: Promise<SessionTurnOutcome> | null;
  ended: Promise<SessionTurnOutcome>;
  resolveEnded(outcome: SessionTurnOutcome): void;
}

const SESSION_STATUS_BY_RUN_STATUS: Record<TerminalRunStatus, SessionStatus> = {
  completed: "idle",
  cancelled: "idle",
  failed: "error",
  interrupted: "idle",
};

export class SessionRunCoordinator {
  private readonly active = new Map<string, ActiveRun>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(private readonly deps: SessionRunCoordinatorDeps) {}

  hasActiveRun(sessionId: string) {
    return this.active.has(sessionId);
  }

  activeRunId(sessionId: string) {
    return this.active.get(sessionId)?.record.id ?? null;
  }

  activeRuns() {
    return [...this.active.values()].map((entry) => entry.record);
  }

  get activeWorkCount() {
    return Math.max(this.active.size, this.background.size);
  }

  outcomeOf(sessionId: string): Promise<SessionTurnOutcome | null> {
    return this.active.get(sessionId)?.ended ?? Promise.resolve(null);
  }

  track<T>(work: Promise<T>): Promise<T> {
    this.background.add(work);
    return work.finally(() => this.background.delete(work));
  }

  async drainBackground() {
    await Promise.allSettled([...this.background]);
  }

  async start(
    sessionId: string,
    triggerMessageId: string,
    agentType: AgentId,
  ): Promise<RunHandle> {
    if (this.active.has(sessionId)) {
      throw new Error(`Session ${sessionId} already has an active turn`);
    }
    let resolveEnded!: (outcome: SessionTurnOutcome) => void;
    const ended = new Promise<SessionTurnOutcome>((resolve) => {
      resolveEnded = resolve;
    });
    const entry: ActiveRun = {
      record: {
        id: this.deps.createId(),
        sessionId,
        triggerMessageId,
        status: "running",
        error: null,
        startedAt: this.deps.now(),
        endedAt: null,
        agentType,
      },
      controller: new AbortController(),
      providerFailure: null,
      lastProviderError: null,
      ending: null,
      ended,
      resolveEnded,
    };
    this.active.set(sessionId, entry);
    try {
      entry.record = await this.deps.store.startRun(entry.record);
    } catch (error) {
      this.active.delete(sessionId);
      throw error;
    }
    this.deps.emit({ type: "run.updated", sessionId, run: entry.record });
    this.deps.emit({ type: "state.changed", sessionId, status: "running" });
    return {
      runId: entry.record.id,
      sessionId,
      signal: entry.controller.signal,
    };
  }

  noteProviderEvent(event: AgentEvent) {
    const entry = this.active.get(event.sessionId);
    if (!entry || entry.ending) return;
    if (event.type === "error") {
      entry.lastProviderError = event.message;
    } else if (event.type === "state.changed" && event.status === "error") {
      entry.providerFailure =
        entry.lastProviderError ?? "The agent reported an error";
    } else if (event.type === "state.changed" && event.status === "running") {
      entry.providerFailure = null;
    }
  }

  async settle(
    handle: RunHandle,
    settlement: RunSettlement,
  ): Promise<SessionTurnOutcome> {
    const entry = this.active.get(handle.sessionId);
    if (!entry || entry.record.id !== handle.runId) {
      return { status: "cancelled" };
    }
    if (entry.ending) return entry.ending;
    const outcome = decideRunOutcome({
      settlement,
      stopped: entry.controller.signal.aborted,
      providerFailure: entry.providerFailure,
    });
    const record = await this.finish(entry, outcome, outcome.status);
    if (record) this.deps.onRunSettled(record);
    return outcome;
  }

  async stop(sessionId: string): Promise<RunRecord | null> {
    return this.end(sessionId, "cancelled");
  }

  async expire(sessionId: string, runId: string, error: string) {
    const entry = this.active.get(sessionId);
    if (!entry || entry.record.id !== runId) return null;
    entry.controller.abort();
    if (entry.ending) {
      await entry.ending;
      return null;
    }
    return this.finish(entry, { status: "failed", error }, "failed");
  }

  async interruptAll() {
    const ended = await Promise.all(
      [...this.active.keys()].map((sessionId) =>
        this.end(sessionId, "interrupted"),
      ),
    );
    return ended.filter((run): run is RunRecord => run !== null);
  }

  private async end(sessionId: string, status: "cancelled" | "interrupted") {
    const entry = this.active.get(sessionId);
    if (!entry) return null;
    entry.controller.abort();
    if (entry.ending) {
      await entry.ending;
      return null;
    }
    return this.finish(entry, { status: "cancelled" }, status);
  }

  private async finish(
    entry: ActiveRun,
    outcome: SessionTurnOutcome,
    status: TerminalRunStatus,
  ): Promise<RunRecord | null> {
    entry.ending = entry.ended;
    const error = outcome.status === "failed" ? outcome.error : null;
    const endedAt = this.deps.now();
    try {
      const finished = await this.deps.afterPersistedEvents(() =>
        this.deps.store.finishRun(entry.record.id, status, endedAt, error),
      );
      entry.record = finished ?? {
        ...entry.record,
        status,
        error,
        endedAt,
      };
    } finally {
      if (this.active.get(entry.record.sessionId) === entry) {
        this.active.delete(entry.record.sessionId);
      }
      entry.resolveEnded(outcome);
    }
    const sessionId = entry.record.sessionId;
    this.deps.emit({ type: "run.updated", sessionId, run: entry.record });
    this.deps.emit({
      type: "state.changed",
      sessionId,
      status: SESSION_STATUS_BY_RUN_STATUS[status],
    });
    this.deps.onRunEnded?.(entry.record);
    return entry.record;
  }
}

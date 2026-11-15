import crypto from "node:crypto";
import type { FollowUpRepository } from "@cocurdex/db";
import {
  type CreateFollowUpPayload,
  FOLLOW_UP_NOTE_MAX_LENGTH,
  type FollowUpRecord,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";

const MAX_WAIT_MS = 60_000;
const RETRY_MS = 60_000;
const PAST_TOLERANCE_MS = 60_000;
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export interface FollowUpServiceDeps {
  repository: FollowUpRepository;
  personaExists(agentId: string): boolean;
  deliver(followUp: FollowUpRecord): Promise<void>;
  announceChanged(): void;
  now?: () => Date;
}

export function followUpMessageId(followUpId: string) {
  return `follow-up-${followUpId}`;
}

export function renderFollowUpMessage(followUp: FollowUpRecord) {
  return [
    `[Follow-up you scheduled at ${followUp.createdAt} for ${followUp.dueAt}. The user did not write this message: act on your note, and tell the user only what is worth telling.]`,
    followUp.note,
  ].join("\n");
}

export function followUpWaitMs(
  pending: readonly Pick<FollowUpRecord, "id" | "dueAt">[],
  now: Date,
  retryAfter: ReadonlyMap<string, number> = new Map(),
) {
  if (pending.length === 0) return null;
  const next = Math.min(
    ...pending.map((followUp) =>
      Math.max(Date.parse(followUp.dueAt), retryAfter.get(followUp.id) ?? 0),
    ),
  );
  return Math.min(Math.max(next - now.getTime(), 0), MAX_WAIT_MS);
}

export class FollowUpService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firing: Promise<void> | null = null;
  private running = false;
  private readonly retryAfter = new Map<string, number>();

  constructor(private readonly deps: FollowUpServiceDeps) {}

  start() {
    this.running = true;
    this.schedule();
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.firing;
  }

  list(agentId: string, status: FollowUpRecord["status"] | null = null) {
    return this.deps.repository.listByAgent(agentId, status);
  }

  get(id: string) {
    return this.deps.repository.getById(id);
  }

  create(payload: CreateFollowUpPayload): FollowUpRecord {
    if (!this.deps.personaExists(payload.agentId)) {
      throw new Error(`Assistant ${payload.agentId} was not found`);
    }
    const note = payload.note.trim();
    if (!note) throw new Error("The follow-up note cannot be empty.");
    if (note.length > FOLLOW_UP_NOTE_MAX_LENGTH) {
      throw new Error(
        `The follow-up note is longer than ${FOLLOW_UP_NOTE_MAX_LENGTH} characters.`,
      );
    }
    const due = Date.parse(payload.dueAt);
    if (Number.isNaN(due)) {
      throw new Error(
        `Invalid follow-up time: ${payload.dueAt}. Use an ISO 8601 time with an offset.`,
      );
    }
    const now = this.now();
    if (due < now.getTime() - PAST_TOLERANCE_MS) {
      throw new Error("The follow-up time is in the past.");
    }
    if (due > now.getTime() + MAX_AHEAD_MS) {
      throw new Error("A follow-up can be at most one year ahead.");
    }
    const followUp: FollowUpRecord = {
      id: crypto.randomUUID(),
      agentId: payload.agentId,
      dueAt: new Date(due).toISOString(),
      note,
      status: "pending",
      createdAt: now.toISOString(),
      firedAt: null,
      canceledAt: null,
    };
    this.deps.repository.insert(followUp);
    this.deps.announceChanged();
    this.schedule();
    return followUp;
  }

  cancel(id: string): FollowUpRecord {
    const followUp = this.deps.repository.getById(id);
    if (!followUp) throw new Error(`Follow-up ${id} was not found`);
    if (followUp.status !== "pending") {
      throw new Error(`Follow-up ${id} is already ${followUp.status}`);
    }
    this.deps.repository.cancel(id, this.now().toISOString());
    this.retryAfter.delete(id);
    this.deps.announceChanged();
    this.schedule();
    return this.deps.repository.getById(id) ?? followUp;
  }

  deleteForAgent(agentId: string) {
    this.deps.repository.deleteByAgent(agentId);
    this.schedule();
  }

  fireDue(): Promise<void> {
    this.firing ??= this.fireDueOnce().finally(() => {
      this.firing = null;
      this.schedule();
    });
    return this.firing;
  }

  private async fireDueOnce() {
    const now = this.now().getTime();
    for (const followUp of this.deps.repository.listPending()) {
      if (!this.running) return;
      if (Date.parse(followUp.dueAt) > now) break;
      if ((this.retryAfter.get(followUp.id) ?? 0) > now) continue;
      try {
        await this.deps.deliver(followUp);
        this.deps.repository.markFired(followUp.id, this.now().toISOString());
        this.retryAfter.delete(followUp.id);
        this.deps.announceChanged();
      } catch (error) {
        this.retryAfter.set(followUp.id, now + RETRY_MS);
        logDaemonDiagnostic("warn", "followUp.deliverFailed", {
          followUpId: followUp.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.running || this.firing) return;
    const wait = followUpWaitMs(
      this.deps.repository.listPending(),
      this.now(),
      this.retryAfter,
    );
    if (wait === null) return;
    this.timer = setTimeout(() => void this.fireDue(), wait);
    this.timer.unref?.();
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }
}

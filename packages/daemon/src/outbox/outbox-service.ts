import crypto from "node:crypto";
import type { PushOutboxRepository, PushOutboxRow } from "@cocurdex/db";
import type { AlertEvent, SessionRecord } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { PushTrigger } from "../push/push-content";
import type { PreparedPush, PushSendResult } from "../push/push-service";
import {
  type AlertSource,
  type AlertTarget,
  alertAllowed,
} from "./alert-policy";

const TICK_MS = 30_000;
const BATCH = 50;
const RETRY_DELAYS_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

export interface OutboxPush {
  prepare(
    trigger: PushTrigger,
    session: SessionRecord,
  ): Promise<PreparedPush[]>;
  send(push: PreparedPush): Promise<PushSendResult>;
}

export interface OutboxServiceDeps {
  repository: PushOutboxRepository;
  push: OutboxPush;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  target(session: SessionRecord): AlertTarget;
  emit(event: AlertEvent): void;
  now?: () => Date;
  tickMs?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function outboxRetryDelayMs(attempts: number) {
  return RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export class OutboxService {
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;
  private flushAgain = false;

  constructor(private readonly deps: OutboxServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.flush(),
      this.deps.tickMs ?? TICK_MS,
    );
    this.timer.unref?.();
    void this.flush();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async alert(trigger: PushTrigger, source: AlertSource) {
    const session = await this.deps.getSession(trigger.sessionId);
    if (!session) return;
    if (!alertAllowed(this.deps.target(session), trigger.kind, source)) return;
    this.deps.emit({
      type: "alert",
      sessionId: session.id,
      kind: trigger.kind,
      title: session.title,
      detail: trigger.detail,
      at: trigger.at,
    });
    const prepared = await this.deps.push.prepare(trigger, session);
    const createdAt = this.now().toISOString();
    for (const push of prepared) {
      this.deps.repository.insert({
        id: crypto.randomUUID(),
        targetHandle: push.targetHandle,
        plaintext: decoder.decode(push.plaintext),
        collapseId: push.collapseId,
        expiresAt: push.expiresAt,
        attempts: 0,
        nextAttemptAt: createdAt,
        createdAt,
      });
    }
    if (prepared.length > 0) await this.flush();
  }

  flush() {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = this.flushUntilIdle().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushUntilIdle() {
    do {
      this.flushAgain = false;
      await this.flushOnce();
    } while (this.flushAgain);
  }

  private async flushOnce() {
    const now = this.now();
    this.deps.repository.deleteExpired(Math.floor(now.getTime() / 1000));
    const due = this.deps.repository.listDue(now.toISOString(), BATCH);
    for (const row of due) await this.deliver(row);
  }

  private async deliver(row: PushOutboxRow) {
    const result = await this.deps.push
      .send({
        targetHandle: row.targetHandle,
        plaintext: encoder.encode(row.plaintext),
        collapseId: row.collapseId,
        expiresAt: row.expiresAt,
      })
      .catch((): PushSendResult => "failed");
    if (result !== "failed") {
      this.deps.repository.delete(row.id);
      return;
    }
    const attempts = row.attempts + 1;
    const delay = outboxRetryDelayMs(attempts);
    if (delay === null) {
      this.deps.repository.delete(row.id);
      logDaemonDiagnostic("warn", "outbox.pushDropped", { attempts });
      return;
    }
    this.deps.repository.reschedule(
      row.id,
      attempts,
      new Date(this.now().getTime() + delay).toISOString(),
    );
  }
}

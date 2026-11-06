import { DatabaseSync } from "node:sqlite";
import { OutboxService } from "@cocurdex/daemon/internal/outbox/outbox-service";
import type {
  PreparedPush,
  PushSendResult,
} from "@cocurdex/daemon/internal/push/push-service";
import { createSqlitePushOutboxRepository } from "@cocurdex/db";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";
import type { AlertEvent, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const session = {
  id: "s1",
  title: "Coach",
  sessionKind: "main",
} as SessionRecord;

function harness(results: PushSendResult[], options: { muted?: boolean } = {}) {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const repository = createSqlitePushOutboxRepository(database);
  let now = new Date("2026-11-06T08:00:00.000Z");
  const sent: string[] = [];
  const events: AlertEvent[] = [];
  const outbox = new OutboxService({
    repository,
    push: {
      prepare: async (trigger) => [
        {
          targetHandle: "phone",
          plaintext: new TextEncoder().encode(trigger.detail ?? ""),
          collapseId: trigger.sessionId,
          expiresAt: Math.floor(now.getTime() / 1000) + 86_400,
        },
      ],
      send: async (push: PreparedPush) => {
        sent.push(new TextDecoder().decode(push.plaintext));
        return results.shift() ?? "sent";
      },
    },
    getSession: async () => session,
    target: () => ({
      sessionKind: "main",
      personaMuted: options.muted ?? false,
      routineDeliver: null,
    }),
    emit: (event) => events.push(event),
    now: () => now,
  });
  const pending = () =>
    database.prepare("SELECT attempts FROM push_outbox").all() as {
      attempts: number;
    }[];
  return {
    outbox,
    sent,
    events,
    pending,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

const trigger = {
  sessionId: "s1",
  kind: "turnCompleted" as const,
  detail: "Done",
  requestId: null,
  at: "2026-11-06T08:00:00.000Z",
};

describe("OutboxService", () => {
  it("emits the alert and sends the push once", async () => {
    const h = harness(["sent"]);
    await h.outbox.alert(trigger, "turn");
    expect(h.events).toMatchObject([{ type: "alert", kind: "turnCompleted" }]);
    expect(h.sent).toEqual(["Done"]);
    expect(h.pending()).toEqual([]);
  });

  it("keeps a failed push and retries it after the backoff", async () => {
    const h = harness(["failed", "sent"]);
    await h.outbox.alert(trigger, "turn");
    expect(h.pending()).toEqual([{ attempts: 1 }]);
    await h.outbox.flush();
    expect(h.sent).toEqual(["Done"]);
    h.advance(30_000);
    await h.outbox.flush();
    expect(h.sent).toEqual(["Done", "Done"]);
    expect(h.pending()).toEqual([]);
  });

  it("drops a push once every retry has failed", async () => {
    const h = harness(Array(7).fill("failed"));
    await h.outbox.alert(trigger, "turn");
    for (const delay of [30_000, 120_000, 600_000, 1_800_000, 3_600_000]) {
      h.advance(delay);
      await h.outbox.flush();
    }
    expect(h.sent).toHaveLength(6);
    expect(h.pending()).toEqual([]);
  });

  it("drops a push that expires before it can be sent", async () => {
    const h = harness(["failed"]);
    await h.outbox.alert(trigger, "turn");
    h.advance(86_400_000);
    await h.outbox.flush();
    expect(h.sent).toEqual(["Done"]);
    expect(h.pending()).toEqual([]);
  });

  it("neither alerts nor pushes for a muted persona", async () => {
    const h = harness([], { muted: true });
    await h.outbox.alert(trigger, "turn");
    expect(h.events).toEqual([]);
    expect(h.sent).toEqual([]);
  });
});

import {
  buildPushContent,
  encodePushContent,
  pushCollapseId,
  pushTriggerForEvent,
} from "@cocurdex/daemon/internal/push/push-content";
import { MAX_PUSH_PLAINTEXT_BYTES, type SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = new Date("2026-11-01T00:00:00.000Z");
const host = { hostId: "host-1", name: "Studio" };

function session(title: string): SessionRecord {
  return { id: "session-1", title } as SessionRecord;
}

describe("push content", () => {
  it("fits any session title and request text into one notification", () => {
    const trigger = pushTriggerForEvent(
      {
        type: "question.requested",
        sessionId: "session-1",
        question: {
          id: "q".repeat(200),
          sessionId: "session-1",
          providerId: "pi",
          question: "长".repeat(5000),
          status: "pending",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      } as never,
      now,
    );
    if (!trigger) throw new Error("A question should notify");
    const content = buildPushContent(trigger, session("题".repeat(5000)), host);

    const encoded = encodePushContent(content);

    expect(encoded.length).toBeLessThanOrEqual(MAX_PUSH_PLAINTEXT_BYTES);
    expect(JSON.parse(new TextDecoder().decode(encoded))).toMatchObject({
      kind: "question",
      sessionId: "session-1",
    });
    expect(Buffer.byteLength(pushCollapseId(trigger))).toBeLessThanOrEqual(64);
  });

  it("stays quiet for a turn the person cancelled", () => {
    const cancelled = pushTriggerForEvent(
      {
        type: "turn.completed",
        sessionId: "session-1",
        messageId: "m1",
        durationMs: 1,
        stopReason: "cancelled",
        completedAt: now.toISOString(),
      },
      now,
    );
    const refused = pushTriggerForEvent(
      {
        type: "turn.completed",
        sessionId: "session-1",
        messageId: "m1",
        durationMs: 1,
        stopReason: "refusal",
        completedAt: now.toISOString(),
      },
      now,
    );

    expect(cancelled).toBeNull();
    expect(refused).toMatchObject({ kind: "turnFailed", detail: "refusal" });
  });
});

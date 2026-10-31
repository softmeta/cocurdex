import { resolveForkPoint } from "@cocurdex/daemon/internal/session-control/fork-point";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function message(id: string, role: MessageRecord["role"]): MessageRecord {
  return {
    id,
    sessionId: "source",
    role,
    content: id,
    attachments: [],
    createdAt: "2026-10-14T00:00:00.000Z",
  };
}

const settled = [
  message("u1", "user"),
  message("a1-text", "assistant"),
  message("a1-final", "assistant"),
  message("u2", "user"),
  message("a2", "assistant"),
];

const ids = (messages: MessageRecord[]) => messages.map(({ id }) => id);

describe("resolveForkPoint", () => {
  it("forks the whole settled session as the latest point", () => {
    const point = resolveForkPoint({ settled, activeTriggerMessageId: null });
    expect(ids(point.included)).toEqual(ids(settled));
    expect(point.userTurnCount).toBeNull();
  });

  it("extends a fork point to the end of its turn", () => {
    for (const throughMessageId of ["u1", "a1-text", "a1-final"]) {
      const point = resolveForkPoint({
        settled,
        throughMessageId,
        activeTriggerMessageId: null,
      });
      expect(ids(point.included)).toEqual(["u1", "a1-text", "a1-final"]);
      expect(point.userTurnCount).toBe(1);
    }
  });

  it("treats a fork from the last turn as the latest point", () => {
    const point = resolveForkPoint({
      settled,
      throughMessageId: "a2",
      activeTriggerMessageId: null,
    });
    expect(point.userTurnCount).toBeNull();
  });

  it("forks a running session through its completed turns", () => {
    const point = resolveForkPoint({ settled, activeTriggerMessageId: "u2" });
    expect(ids(point.included)).toEqual(["u1", "a1-text", "a1-final"]);
    expect(point.userTurnCount).toBe(1);
  });

  it("refuses to fork from a turn that is still running", () => {
    expect(() =>
      resolveForkPoint({
        settled,
        throughMessageId: "a2",
        activeTriggerMessageId: "u2",
      }),
    ).toThrow("Wait for this turn to finish");
    expect(() =>
      resolveForkPoint({ settled, activeTriggerMessageId: "u1" }),
    ).toThrow("Wait for the first turn to finish");
  });

  it("rejects an unknown message", () => {
    expect(() =>
      resolveForkPoint({
        settled,
        throughMessageId: "missing",
        activeTriggerMessageId: null,
      }),
    ).toThrow("Message missing was not found");
  });
});

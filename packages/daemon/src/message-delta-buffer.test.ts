import type { AgentMessageDeltaEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createMessageDeltaBuffer } from "./message-delta-buffer";

function delta(
  overrides: Partial<AgentMessageDeltaEvent> & { delta: string },
): AgentMessageDeltaEvent {
  return {
    type: "message.delta",
    sessionId: "session-1",
    messageId: "message-1",
    role: "assistant",
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("createMessageDeltaBuffer", () => {
  it("accumulates many deltas in memory and drains a single record", () => {
    const buffer = createMessageDeltaBuffer();

    for (const chunk of ["Hel", "lo ", "wor", "ld"]) {
      buffer.append(delta({ delta: chunk }));
    }

    const drained = buffer.drain("session-1");
    expect(drained).toEqual([
      expect.objectContaining({
        id: "message-1",
        sessionId: "session-1",
        content: "Hello world",
      }),
    ]);
    expect(buffer.drain("session-1")).toEqual([]);
  });

  it("releases a buffered message superseded by a completed event", () => {
    const buffer = createMessageDeltaBuffer();

    buffer.append(delta({ delta: "partial" }));
    buffer.release("message-1");

    expect(buffer.drain("session-1")).toEqual([]);
  });

  it("keeps reasoning buffered until drain when no completed event arrives", () => {
    const buffer = createMessageDeltaBuffer();

    buffer.append(
      delta({
        messageId: "message-1:reasoning",
        kind: "reasoning",
        delta: "think",
      }),
    );
    buffer.append(
      delta({ messageId: "message-1", kind: "response", delta: "answer" }),
    );
    buffer.release("message-1");

    expect(buffer.drain("session-1")).toEqual([
      expect.objectContaining({
        id: "message-1:reasoning",
        kind: "reasoning",
        content: "think",
      }),
    ]);
  });

  it("only drains records for the requested session, oldest first", () => {
    const buffer = createMessageDeltaBuffer();

    buffer.append(
      delta({ messageId: "a", sessionId: "session-1", delta: "a" }),
    );
    buffer.append(
      delta({ messageId: "b", sessionId: "session-2", delta: "b" }),
    );
    buffer.append(
      delta({ messageId: "c", sessionId: "session-1", delta: "c" }),
    );

    expect(buffer.drain("session-1").map((record) => record.id)).toEqual([
      "a",
      "c",
    ]);
    expect(buffer.drain("session-2").map((record) => record.id)).toEqual(["b"]);
  });

  it("lists a session snapshot without consuming buffered messages", () => {
    const buffer = createMessageDeltaBuffer();

    buffer.append(delta({ messageId: "a", delta: "partial" }));
    buffer.append(
      delta({ messageId: "b", sessionId: "session-2", delta: "other" }),
    );

    expect(buffer.list("session-1").map((record) => record.id)).toEqual(["a"]);
    expect(buffer.drain("session-1").map((record) => record.id)).toEqual(["a"]);
  });
});

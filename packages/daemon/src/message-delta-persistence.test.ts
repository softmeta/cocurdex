import type { AgentMessageDeltaEvent, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { mergeMessageDelta } from "./message-delta-persistence";

function messageDelta(
  delta: string,
  kind: AgentMessageDeltaEvent["kind"] = "reasoning",
): AgentMessageDeltaEvent {
  return {
    type: "message.delta",
    sessionId: "session-1",
    messageId: "message-1:reasoning:part-1",
    role: "assistant",
    kind,
    delta,
    createdAt: "2026-05-20T00:00:00.000Z",
  };
}

describe("mergeMessageDelta", () => {
  it("creates a durable reasoning message from the first delta", () => {
    expect(mergeMessageDelta(null, messageDelta("Thinking"))).toMatchObject({
      id: "message-1:reasoning:part-1",
      sessionId: "session-1",
      role: "assistant",
      kind: "reasoning",
      content: "Thinking",
      attachments: [],
      createdAt: "2026-05-20T00:00:00.000Z",
    });
  });

  it("appends later deltas without changing the original timestamp", () => {
    const existingMessage: MessageRecord = {
      id: "message-1:reasoning:part-1",
      sessionId: "session-1",
      role: "assistant",
      kind: "reasoning",
      content: "Thinking",
      attachments: [],
      createdAt: "2026-05-20T00:00:00.000Z",
    };

    expect(mergeMessageDelta(existingMessage, messageDelta(" more"))).toEqual({
      ...existingMessage,
      content: "Thinking more",
    });
  });
});

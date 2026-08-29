import type { AgentEvent, AgentMessageDeltaEvent } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEventBroadcastCoalescer } from "./event-broadcast-coalescer";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("createEventBroadcastCoalescer", () => {
  it("merges deltas for the same message within the flush window", () => {
    vi.useFakeTimers();
    const sent: AgentEvent[] = [];
    const coalescer = createEventBroadcastCoalescer((event) => {
      sent.push(event);
    });

    coalescer.push(delta({ delta: "Hel" }));
    coalescer.push(
      delta({ delta: "lo", createdAt: "2026-06-25T00:00:01.000Z" }),
    );

    vi.advanceTimersByTime(16);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "message.delta",
      delta: "Hello",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
  });

  it("flushes deltas before forwarding a non-delta event", () => {
    vi.useFakeTimers();
    const sent: AgentEvent[] = [];
    const coalescer = createEventBroadcastCoalescer((event) => {
      sent.push(event);
    });

    coalescer.push(delta({ delta: "partial" }));
    coalescer.push({
      type: "state.changed",
      sessionId: "session-1",
      status: "idle",
    });

    expect(sent.map((event) => event.type)).toEqual([
      "message.delta",
      "state.changed",
    ]);
  });
});

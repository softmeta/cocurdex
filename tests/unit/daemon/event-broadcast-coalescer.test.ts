import { createEventBroadcastCoalescer } from "@cocurdex/daemon/internal/event-broadcast-coalescer";
import type {
  AgentEvent,
  AgentMessageDeltaEvent,
  AgentToolCallRecord,
} from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function toolEvent(
  type: "tool.started" | "tool.updated" | "tool.finished",
  id: string,
  updatedAt: string,
): AgentEvent {
  const toolCall: AgentToolCallRecord = {
    id,
    sessionId: "session-1",
    title: "Run tests",
    status: type === "tool.finished" ? "completed" : "in_progress",
    content: undefined,
    locations: [],
    startedAt: "2026-06-25T00:00:00.000Z",
    updatedAt,
  };
  return { type, sessionId: "session-1", toolCall };
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

  it("sends one progress event per tool call per window and keeps it a start", () => {
    vi.useFakeTimers();
    const sent: AgentEvent[] = [];
    const coalescer = createEventBroadcastCoalescer((event) => {
      sent.push(event);
    });

    coalescer.push(toolEvent("tool.started", "tool-1", "t0"));
    for (let tick = 1; tick <= 50; tick += 1) {
      coalescer.push(toolEvent("tool.updated", "tool-1", `t${tick}`));
    }
    coalescer.push(toolEvent("tool.started", "tool-2", "t0"));
    vi.advanceTimersByTime(16);

    expect(sent).toMatchObject([
      { type: "tool.started", toolCall: { id: "tool-1", updatedAt: "t50" } },
      { type: "tool.started", toolCall: { id: "tool-2" } },
    ]);
  });

  it("delivers pending progress before the tool finishes", () => {
    vi.useFakeTimers();
    const sent: AgentEvent[] = [];
    const coalescer = createEventBroadcastCoalescer((event) => {
      sent.push(event);
    });

    coalescer.push(toolEvent("tool.updated", "tool-1", "t1"));
    coalescer.push(toolEvent("tool.finished", "tool-1", "t2"));

    expect(sent.map((event) => event.type)).toEqual([
      "tool.updated",
      "tool.finished",
    ]);
  });
});

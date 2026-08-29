import type { AgentEvent } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyToolEventAtom,
  bootstrapToolCallsAtom,
  toolCallsBySessionAtom,
} from "@/features/agent/tool-call/tool-call-store";

describe("tool call store", () => {
  it("tracks started, updated, and finished tool calls for a session", () => {
    const store = createStore();
    const sessionId = "session-1";

    const startedEvent: AgentEvent = {
      type: "tool.started",
      sessionId,
      toolCall: {
        id: "tool-1",
        sessionId,
        title: "Read package.json",
        kind: "read",
        status: "in_progress",
        content: [],
        locations: [{ path: "/tmp/repo/package.json" }],
        startedAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:00:01.000Z",
      },
    };

    store.set(applyToolEventAtom, startedEvent);
    store.set(applyToolEventAtom, {
      type: "tool.updated",
      sessionId,
      toolCall: {
        ...startedEvent.toolCall,
        status: "in_progress",
        content: [{ type: "text", text: "Reading package.json" }],
        updatedAt: "2026-04-22T12:00:01.500Z",
      },
    });

    expect(store.get(toolCallsBySessionAtom)[sessionId]).toEqual([
      {
        ...startedEvent.toolCall,
        status: "in_progress",
        content: [{ type: "text", text: "Reading package.json" }],
        updatedAt: "2026-04-22T12:00:01.500Z",
      },
    ]);

    store.set(applyToolEventAtom, {
      type: "tool.finished",
      sessionId,
      toolCall: {
        ...startedEvent.toolCall,
        status: "completed",
        rawOutput: { bytes: 123 },
        updatedAt: "2026-04-22T12:00:02.000Z",
      },
    });

    expect(store.get(toolCallsBySessionAtom)[sessionId]).toEqual([
      {
        ...startedEvent.toolCall,
        status: "completed",
        rawOutput: { bytes: 123 },
        updatedAt: "2026-04-22T12:00:02.000Z",
      },
    ]);
  });

  it("bootstraps persisted tool calls by session", () => {
    const store = createStore();
    const sessionId = "session-1";

    store.set(bootstrapToolCallsAtom, [
      {
        id: "tool-2",
        sessionId,
        title: "Write result",
        kind: "write",
        status: "completed",
        content: [],
        locations: [],
        startedAt: "2026-04-22T12:00:03.000Z",
        updatedAt: "2026-04-22T12:00:04.000Z",
      },
      {
        id: "tool-1",
        sessionId,
        title: "Read package.json",
        kind: "read",
        status: "completed",
        content: [],
        locations: [],
        startedAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:00:01.000Z",
      },
    ]);

    expect(
      store.get(toolCallsBySessionAtom)[sessionId]?.map(({ id }) => id),
    ).toEqual(["tool-1", "tool-2"]);
  });
});

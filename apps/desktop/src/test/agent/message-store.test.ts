import type { AgentEvent, MessageRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAgentEventAtom,
  messagesBySessionAtom,
  rewindMessagesAtom,
} from "@/features/agent/view/message-store";

afterEach(() => {
  vi.useRealTimers();
});

describe("message store", () => {
  it("merges assistant deltas and preserves their first timestamp", () => {
    const store = createStore();
    const sessionId = "session-1";
    const messageId = "assistant-1";

    const deltaEvent: AgentEvent = {
      type: "message.delta",
      sessionId,
      messageId,
      role: "assistant",
      delta: "Hello",
      createdAt: "2026-04-22T10:00:00.000Z",
    };

    store.set(applyAgentEventAtom, deltaEvent);
    store.set(applyAgentEventAtom, {
      ...deltaEvent,
      delta: " world",
    });

    const completedMessage: MessageRecord = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Hello world",
      attachments: [],
      createdAt: "2026-04-22T10:00:01.000Z",
    };

    store.set(applyAgentEventAtom, {
      type: "message.completed",
      sessionId,
      message: completedMessage,
    });

    expect(store.get(messagesBySessionAtom)[sessionId]).toEqual([
      {
        ...completedMessage,
        createdAt: deltaEvent.createdAt,
      },
    ]);
  });

  it("keeps reasoning deltas separate from response deltas", () => {
    vi.useFakeTimers();
    const store = createStore();
    const sessionId = "session-1";

    store.set(applyAgentEventAtom, {
      type: "message.delta",
      sessionId,
      messageId: "assistant-1:reasoning:part-1",
      role: "assistant",
      kind: "reasoning",
      delta: "Checking constraints.",
      createdAt: "2026-04-22T10:00:00.000Z",
    });

    store.set(applyAgentEventAtom, {
      type: "message.delta",
      sessionId,
      messageId: "assistant-1",
      role: "assistant",
      kind: "response",
      delta: "Use this implementation.",
      createdAt: "2026-04-22T10:00:01.000Z",
    });

    vi.runOnlyPendingTimers();

    expect(store.get(messagesBySessionAtom)[sessionId]).toMatchObject([
      {
        id: "assistant-1:reasoning:part-1",
        kind: "reasoning",
        content: "Checking constraints.",
      },
      {
        id: "assistant-1",
        kind: "response",
        content: "Use this implementation.",
      },
    ]);
  });

  it("batches high-frequency deltas while preserving content order", () => {
    vi.useFakeTimers();
    const store = createStore();
    const sessionId = "session-1";

    for (const delta of ["One", " two", " three"]) {
      store.set(applyAgentEventAtom, {
        type: "message.delta",
        sessionId,
        messageId: "assistant-1",
        role: "assistant",
        kind: "response",
        delta,
        createdAt: "2026-04-22T10:00:00.000Z",
      });
    }

    expect(store.get(messagesBySessionAtom)[sessionId]).toBeUndefined();

    vi.runOnlyPendingTimers();

    expect(store.get(messagesBySessionAtom)[sessionId]).toMatchObject([
      {
        id: "assistant-1",
        kind: "response",
        content: "One two three",
      },
    ]);
  });

  it("rewinds messages after the edited user prompt", () => {
    const store = createStore();
    const sessionId = "session-1";
    const firstUserMessage: MessageRecord = {
      id: "user-1",
      sessionId,
      role: "user",
      content: "original prompt",
      attachments: [],
      createdAt: "2026-04-22T10:00:00.000Z",
    };
    const assistantMessage: MessageRecord = {
      id: "assistant-1",
      sessionId,
      role: "assistant",
      content: "old answer",
      attachments: [],
      createdAt: "2026-04-22T10:00:01.000Z",
    };
    const secondUserMessage: MessageRecord = {
      id: "user-2",
      sessionId,
      role: "user",
      content: "follow-up",
      attachments: [],
      createdAt: "2026-04-22T10:00:02.000Z",
    };

    store.set(applyAgentEventAtom, {
      type: "message.completed",
      sessionId,
      message: firstUserMessage,
    });
    store.set(applyAgentEventAtom, {
      type: "message.completed",
      sessionId,
      message: assistantMessage,
    });
    store.set(applyAgentEventAtom, {
      type: "message.completed",
      sessionId,
      message: secondUserMessage,
    });

    store.set(rewindMessagesAtom, {
      message: {
        ...firstUserMessage,
        content: "edited prompt",
      },
    });

    expect(store.get(messagesBySessionAtom)[sessionId]).toEqual([
      {
        ...firstUserMessage,
        content: "edited prompt",
      },
    ]);
  });
});

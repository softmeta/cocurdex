import type { AgentEvent, MessageRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAgentEventAtom,
  bootstrapMessagesAtom,
  createSessionMessagesAtom,
  loadSessionMessagesAtom,
  messagesBySessionAtom,
} from "./message-store";

function delta(sessionId: string, content: string): AgentEvent {
  return {
    type: "message.delta",
    sessionId,
    messageId: "answer",
    role: "assistant",
    delta: content,
    createdAt: "2026-09-08T00:00:00Z",
  };
}

afterEach(() => vi.useRealTimers());

describe("session message updates", () => {
  it("does not notify a session subscriber when another session streams", () => {
    vi.useFakeTimers();
    const store = createStore();
    const selected = createSessionMessagesAtom("selected");
    const notify = vi.fn();
    const unsubscribe = store.sub(selected, notify);

    store.set(applyAgentEventAtom, delta("background", "one"));
    vi.runOnlyPendingTimers();
    expect(notify).not.toHaveBeenCalled();
    store.set(applyAgentEventAtom, delta("selected", "two"));
    vi.runOnlyPendingTimers();
    expect(store.get(selected)[0].content).toBe("two");
    expect(notify).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("keeps pending deltas isolated between stores", () => {
    vi.useFakeTimers();
    const first = createStore();
    const second = createStore();
    first.set(applyAgentEventAtom, delta("same", "first"));
    second.set(applyAgentEventAtom, delta("same", "second"));
    vi.runOnlyPendingTimers();
    expect(first.get(messagesBySessionAtom).same[0].content).toBe("first");
    expect(second.get(messagesBySessionAtom).same[0].content).toBe("second");
  });

  it("preserves newer streamed content when merging persisted history", () => {
    vi.useFakeTimers();
    const store = createStore();
    store.set(applyAgentEventAtom, delta("session", "latest"));
    vi.runOnlyPendingTimers();
    const streamed = store.get(messagesBySessionAtom).session;
    const persisted: MessageRecord = {
      ...streamed[0],
      content: "older",
    };
    store.set(loadSessionMessagesAtom, {
      sessionId: "session",
      messages: [persisted],
    });
    expect(store.get(messagesBySessionAtom).session[0].content).toBe("latest");
    expect(persisted.content).toBe("older");
  });

  it("discards pending updates when replacing the bootstrap snapshot", () => {
    vi.useFakeTimers();
    const store = createStore();
    store.set(applyAgentEventAtom, delta("old", "pending"));
    store.set(bootstrapMessagesAtom, []);
    vi.runOnlyPendingTimers();
    expect(store.get(messagesBySessionAtom)).toEqual({});
  });
});

import type {
  ChatEvent,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSnapshot,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopApi } from "@/lib/ipc";
import {
  applyChatEventAtom,
  conversationsAtom,
  loadConversationMessagesAtom,
  messagesByConversationAtom,
  streamingConversationIdsAtom,
} from "./chat-store";

vi.mock("@/lib/ipc", () => ({ desktopApi: { chatGet: vi.fn() } }));

const conversation: ConversationRecord = {
  id: "chat",
  title: "Chat",
  providerId: "custom",
  modelId: "test",
  systemPrompt: null,
  presetId: null,
  webSearchEnabled: false,
  createdAt: "2026-09-05T00:00:00Z",
  updatedAt: "2026-09-05T00:00:00Z",
  lastMessageAt: null,
  archivedAt: null,
};
function message(
  text: string,
  status: ConversationMessageRecord["status"] = "streaming",
): ConversationMessageRecord {
  return {
    id: "response",
    conversationId: "chat",
    role: "assistant",
    content: [{ type: "text", text }],
    status,
    error: null,
    usage: null,
    sources: [],
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}
function event(
  revision: number,
  text: string,
  status: ConversationMessageRecord["status"] = "streaming",
): ChatEvent {
  return {
    type: "conversation.message.updated",
    conversationId: "chat",
    revision,
    runtimeId: "runtime",
    message: message(text, status),
  };
}
function snapshot(revision: number, text: string): ConversationSnapshot {
  return {
    conversation,
    messages: [message(text)],
    revision,
    runtimeId: "runtime",
  };
}
beforeEach(() => vi.clearAllMocks());

describe("chat snapshot and event reconciliation", () => {
  it("recovers streaming state from a snapshot without a created event", async () => {
    const store = createStore();
    vi.mocked(desktopApi.chatGet).mockResolvedValue(snapshot(4, "Partial"));
    await store.set(loadConversationMessagesAtom, "chat");
    expect(store.get(streamingConversationIdsAtom).has("chat")).toBe(true);
    store.set(applyChatEventAtom, event(5, "Partial answer", "cancelled"));
    expect(store.get(streamingConversationIdsAtom).has("chat")).toBe(false);
  });
  it("replays newer full messages over a delayed snapshot and ignores old events", async () => {
    const store = createStore();
    let resolve = (_snapshot: ConversationSnapshot | null) => {};
    vi.mocked(desktopApi.chatGet).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = store.set(loadConversationMessagesAtom, "chat");
    store.set(applyChatEventAtom, event(6, "Complete", "completed"));
    resolve(snapshot(4, "Partial"));
    await loading;
    store.set(applyChatEventAtom, event(5, "Stale"));
    expect(store.get(messagesByConversationAtom).chat).toEqual([
      message("Complete", "completed"),
    ]);
    expect(store.get(streamingConversationIdsAtom).size).toBe(0);
  });
  it("preserves deletion while a snapshot is in flight", async () => {
    const store = createStore();
    let resolve = (_snapshot: ConversationSnapshot | null) => {};
    vi.mocked(desktopApi.chatGet).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = store.set(loadConversationMessagesAtom, "chat");
    store.set(applyChatEventAtom, {
      type: "conversation.deleted",
      conversationId: "chat",
      revision: 5,
      runtimeId: "runtime",
    });
    resolve(snapshot(4, "Partial"));
    await loading;
    expect(store.get(conversationsAtom)).toEqual([]);
    expect(store.get(messagesByConversationAtom).chat).toBeUndefined();
  });
  it("accepts a new daemon epoch and permits recovery after a failed load", async () => {
    const store = createStore();
    store.set(applyChatEventAtom, event(100, "Old"));
    vi.mocked(desktopApi.chatGet).mockRejectedValueOnce(
      new Error("Disconnected"),
    );
    await expect(
      store.set(loadConversationMessagesAtom, "chat"),
    ).rejects.toThrow("Disconnected");
    vi.mocked(desktopApi.chatGet).mockResolvedValue({
      ...snapshot(0, "Recovered"),
      runtimeId: "restart",
    });
    await store.set(loadConversationMessagesAtom, "chat");
    store.set(applyChatEventAtom, {
      ...event(1, "Done", "completed"),
      runtimeId: "restart",
    });
    expect(store.get(messagesByConversationAtom).chat).toEqual([
      message("Done", "completed"),
    ]);
  });
});

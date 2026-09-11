import type { SessionRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { selectConversationAtom } from "@/features/chat/chat-store";
import {
  activeSessionIdAtom,
  bootstrapSessionsAtom,
  selectSessionAtom,
} from "../session-store";
import {
  bindFocusedPaneContentAtom,
  collapseSessionSplitAtom,
  focusedPaneIdAtom,
  sessionSplitLayoutAtom,
  splitFocusedPaneAtom,
} from "./session-split-store";
import { findPane, listPanes, ROOT_PANE_ID } from "./session-split-tree";

const sessionA: SessionRecord = {
  id: "session-a",
  workspaceId: "workspace-1",
  title: "Session A",
  agentType: "codex",
  status: "idle",
  writeMode: "read-only",
  collaborationMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastMessageAt: null,
  permissionMode: "codex-read-only",
};

describe("session split store", () => {
  it("binds the focused pane when a session is selected", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);

    expect(
      findPane(store.get(sessionSplitLayoutAtom), ROOT_PANE_ID)?.sessionId,
    ).toBe(sessionA.id);
  });

  it("focuses the pane that already shows a session instead of duplicating it", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(splitFocusedPaneAtom, "right");
    expect(store.get(focusedPaneIdAtom)).not.toBe(ROOT_PANE_ID);

    store.set(selectSessionAtom, sessionA.id);

    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
    const panesWithSession = listPanes(
      store.get(sessionSplitLayoutAtom),
    ).filter((pane) => pane.sessionId === sessionA.id);
    expect(panesWithSession).toHaveLength(1);
  });

  it("collapses every split and keeps the chosen pane's session", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(splitFocusedPaneAtom, "right");
    expect(store.get(focusedPaneIdAtom)).not.toBe(ROOT_PANE_ID);

    const kept = store.set(collapseSessionSplitAtom, ROOT_PANE_ID);

    expect(kept?.sessionId).toBe(sessionA.id);
    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
    expect(listPanes(store.get(sessionSplitLayoutAtom))).toEqual([
      {
        id: ROOT_PANE_ID,
        sessionId: sessionA.id,
        conversationId: null,
      },
    ]);
  });

  it("derives the active session from the focused pane", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    expect(store.get(activeSessionIdAtom)).toBe(sessionA.id);

    store.set(splitFocusedPaneAtom, "right");
    expect(store.get(activeSessionIdAtom)).toBeNull();
  });

  it("focuses the pane that already shows a conversation instead of duplicating it", () => {
    const store = createStore();
    store.set(bindFocusedPaneContentAtom, {
      sessionId: null,
      conversationId: "conversation-a",
    });
    store.set(splitFocusedPaneAtom, "right");
    expect(store.get(focusedPaneIdAtom)).not.toBe(ROOT_PANE_ID);

    store.set(selectConversationAtom, "conversation-a");

    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
    const panesWithConversation = listPanes(
      store.get(sessionSplitLayoutAtom),
    ).filter((pane) => pane.conversationId === "conversation-a");
    expect(panesWithConversation).toHaveLength(1);
  });
});

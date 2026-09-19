import type { SessionRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { selectConversationAtom } from "@/features/chat/chat-store";
import {
  activeSessionIdAtom,
  bootstrapSessionsAtom,
  openSessionInSplitAtom,
  selectSessionAtom,
} from "../session-store";
import {
  bindFocusedPaneContentAtom,
  bindPaneContentAtom,
  collapseSessionSplitAtom,
  focusedPaneIdAtom,
  focusSessionPaneAtom,
  sessionSplitLayoutAtom,
  setSessionPaneSizeAtom,
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
  sessionModeId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastMessageAt: null,
  permissionMode: "codex-read-only",
};

const sessionB: SessionRecord = {
  ...sessionA,
  id: "session-b",
  title: "Session B",
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

  it("opens a session in a new pane when splitting", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA, sessionB]);
    store.set(selectSessionAtom, sessionA.id);

    store.set(openSessionInSplitAtom, {
      sessionId: sessionB.id,
      direction: "right",
    });

    const panes = listPanes(store.get(sessionSplitLayoutAtom));
    expect(panes).toHaveLength(2);
    expect(panes[0]?.sessionId).toBe(sessionA.id);
    const focused = findPane(
      store.get(sessionSplitLayoutAtom),
      store.get(focusedPaneIdAtom),
    );
    expect(focused?.sessionId).toBe(sessionB.id);
  });

  it("focuses the existing pane instead of splitting an open session", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(splitFocusedPaneAtom, "right");
    expect(store.get(focusedPaneIdAtom)).not.toBe(ROOT_PANE_ID);

    store.set(openSessionInSplitAtom, {
      sessionId: sessionA.id,
      direction: "down",
    });

    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(2);
    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
  });

  it("keeps the current pane when a closed pane finishes binding later", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(splitFocusedPaneAtom, "right");
    const closedPaneId = store.get(focusedPaneIdAtom);
    store.set(collapseSessionSplitAtom, ROOT_PANE_ID);

    store.set(bindPaneContentAtom, {
      paneId: closedPaneId,
      sessionId: null,
      conversationId: "conversation-late",
    });

    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
    expect(
      findPane(store.get(sessionSplitLayoutAtom), ROOT_PANE_ID)?.conversationId,
    ).toBeNull();
    expect(store.get(activeSessionIdAtom)).toBe(sessionA.id);
  });

  it("refuses a right split when the pane is narrower than two panes", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 700, height: 900 },
    });

    expect(store.set(splitFocusedPaneAtom, "right")).toBeNull();
    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(1);
  });

  it("splits right once the pane fits two panes", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 800, height: 900 },
    });

    expect(store.set(splitFocusedPaneAtom, "right")).not.toBeNull();
    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(2);
  });

  it("refuses a split down when the pane is shorter than two panes", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 900, height: 500 },
    });

    expect(store.set(splitFocusedPaneAtom, "down")).toBeNull();
    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(1);
  });

  it("splits down once the pane fits two panes", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 400, height: 700 },
    });

    expect(store.set(splitFocusedPaneAtom, "down")).not.toBeNull();
    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(2);
  });

  it("keeps the focused pane bound when opening to the right is refused", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA, sessionB]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 700, height: 900 },
    });

    store.set(openSessionInSplitAtom, {
      sessionId: sessionB.id,
      direction: "right",
    });

    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(1);
    expect(
      findPane(store.get(sessionSplitLayoutAtom), ROOT_PANE_ID)?.sessionId,
    ).toBe(sessionA.id);
    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
  });

  it("keeps the focused pane bound when opening below is refused", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA, sessionB]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 900, height: 500 },
    });

    store.set(openSessionInSplitAtom, {
      sessionId: sessionB.id,
      direction: "down",
    });

    expect(listPanes(store.get(sessionSplitLayoutAtom))).toHaveLength(1);
    expect(
      findPane(store.get(sessionSplitLayoutAtom), ROOT_PANE_ID)?.sessionId,
    ).toBe(sessionA.id);
    expect(store.get(focusedPaneIdAtom)).toBe(ROOT_PANE_ID);
  });

  it("measures each pane on its own for the split floors", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [sessionA]);
    store.set(selectSessionAtom, sessionA.id);
    store.set(splitFocusedPaneAtom, "right");
    const roomyPaneId = store.get(focusedPaneIdAtom);
    store.set(setSessionPaneSizeAtom, {
      paneId: ROOT_PANE_ID,
      size: { width: 700, height: 900 },
    });
    store.set(setSessionPaneSizeAtom, {
      paneId: roomyPaneId,
      size: { width: 800, height: 900 },
    });

    expect(store.set(splitFocusedPaneAtom, "right")).not.toBeNull();
    expect(store.get(focusedPaneIdAtom)).not.toBe(roomyPaneId);

    store.set(focusSessionPaneAtom, ROOT_PANE_ID);
    expect(store.set(splitFocusedPaneAtom, "right")).toBeNull();
  });
});

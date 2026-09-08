import { atom } from "jotai";
import {
  clearPaneSessions,
  closePane,
  createRootPane,
  findPane,
  findPaneIdByConversationId,
  findPaneIdBySessionId,
  MAX_SESSION_PANES,
  paneCount,
  ROOT_PANE_ID,
  type SessionPaneBinding,
  type SessionSplitDirection,
  type SessionSplitNode,
  setPaneBinding,
  setSplitSizes,
  splitPane,
} from "./session-split-tree";

export const sessionSplitLayoutAtom = atom<SessionSplitNode>(createRootPane());
export const focusedPaneIdAtom = atom<string>(ROOT_PANE_ID);

export const focusedSessionPaneAtom = atom((get) => {
  return findPane(get(sessionSplitLayoutAtom), get(focusedPaneIdAtom));
});

export const sessionPaneCountAtom = atom((get) => {
  return paneCount(get(sessionSplitLayoutAtom));
});

export const canSplitSessionPaneAtom = atom((get) => {
  return get(sessionPaneCountAtom) < MAX_SESSION_PANES;
});

export const resetSessionSplitLayoutAtom = atom(null, (_get, set) => {
  set(sessionSplitLayoutAtom, createRootPane());
  set(focusedPaneIdAtom, ROOT_PANE_ID);
});

export const bindPaneContentAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      paneId: string;
      sessionId: string | null;
      conversationId: string | null;
    },
  ) => {
    set(
      sessionSplitLayoutAtom,
      setPaneBinding(get(sessionSplitLayoutAtom), payload.paneId, {
        sessionId: payload.sessionId,
        conversationId: payload.conversationId,
      }),
    );
  },
);

export const bindFocusedPaneContentAtom = atom(
  null,
  (
    get,
    set,
    content: Pick<SessionPaneBinding, "sessionId" | "conversationId">,
  ) => {
    set(bindPaneContentAtom, {
      paneId: get(focusedPaneIdAtom),
      ...content,
    });
  },
);

export const focusSessionPaneAtom = atom(null, (_get, set, paneId: string) => {
  set(focusedPaneIdAtom, paneId);
});

export const splitFocusedPaneAtom = atom(
  null,
  (get, set, direction: SessionSplitDirection) => {
    const result = splitPane(
      get(sessionSplitLayoutAtom),
      get(focusedPaneIdAtom),
      direction,
    );
    if (!result) {
      return null;
    }
    set(sessionSplitLayoutAtom, result.root);
    set(focusedPaneIdAtom, result.newPaneId);
    return findPane(result.root, result.newPaneId);
  },
);

export const closeSessionPaneAtom = atom(null, (get, set, paneId: string) => {
  const layout = get(sessionSplitLayoutAtom);
  const result = closePane(layout, paneId);
  if (!result) {
    return null;
  }
  set(sessionSplitLayoutAtom, result.root);
  const focusedId = get(focusedPaneIdAtom);
  if (focusedId === paneId) {
    set(focusedPaneIdAtom, result.successor.id);
    return result.successor;
  }
  return findPane(result.root, focusedId);
});

export const setSessionSplitSizesAtom = atom(
  null,
  (get, set, payload: { splitId: string; sizes: [number, number] }) => {
    set(
      sessionSplitLayoutAtom,
      setSplitSizes(
        get(sessionSplitLayoutAtom),
        payload.splitId,
        payload.sizes,
      ),
    );
  },
);

export const focusPaneForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const paneId = findPaneIdBySessionId(
      get(sessionSplitLayoutAtom),
      sessionId,
    );
    if (!paneId) {
      return false;
    }
    set(focusedPaneIdAtom, paneId);
    return true;
  },
);

export const focusPaneForConversationAtom = atom(
  null,
  (get, set, conversationId: string) => {
    const paneId = findPaneIdByConversationId(
      get(sessionSplitLayoutAtom),
      conversationId,
    );
    if (!paneId) {
      return false;
    }
    set(focusedPaneIdAtom, paneId);
    return true;
  },
);

export const clearRemovedPaneSessionsAtom = atom(
  null,
  (get, set, sessionIds: ReadonlySet<string>) => {
    set(
      sessionSplitLayoutAtom,
      clearPaneSessions(get(sessionSplitLayoutAtom), sessionIds),
    );
  },
);

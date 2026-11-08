import {
  isChatSession,
  isPersonalSession,
  type SessionRecord,
  sessionAncestorIds,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import {
  activeWorkspaceIdAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "../workspaces/workspace-store";
import {
  bindFocusedPaneContentAtom,
  focusedPaneIdAtom,
  focusSessionPaneAtom,
  sessionSplitLayoutAtom,
  splitFocusedPaneAtom,
} from "./session-split/session-split-store";
import {
  findPane,
  findPaneIdBySessionId,
  type SessionSplitDirection,
} from "./session-split/session-split-tree";

export const sessionsAtom = atom<SessionRecord[]>([]);
export const activeSessionIdAtom = atom((get) => {
  return (
    findPane(get(sessionSplitLayoutAtom), get(focusedPaneIdAtom))?.sessionId ??
    null
  );
});
export const collapsedSessionIdsAtom = atom<ReadonlySet<string>>(
  new Set<string>(),
);

export const toggleSessionCollapsedAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const next = new Set(get(collapsedSessionIdsAtom));
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    set(collapsedSessionIdsAtom, next);
  },
);
export function getNextActiveSessionId(
  remaining: SessionRecord[],
  removed: SessionRecord | undefined,
) {
  if (removed?.parentSessionId) {
    const parent = remaining.find(
      (session) => session.id === removed.parentSessionId,
    );
    if (parent) {
      return parent.id;
    }
  }

  const sameFamily = removed
    ? remaining.filter(
        (session) => sessionFamilyOf(session) === sessionFamilyOf(removed),
      )
    : remaining;
  return (
    sameFamily.find((session) => !session.parentSessionId)?.id ??
    sameFamily[0]?.id ??
    null
  );
}

function sessionFamilyOf(session: Pick<SessionRecord, "sessionKind">) {
  if (isChatSession(session)) return "chat";
  if (isPersonalSession(session)) return "personal";
  return "work";
}

export function activateWorkspaceForSession(
  get: Getter,
  set: Setter,
  sessionId: string,
) {
  const session = get(sessionsAtom).find((item) => item.id === sessionId);
  if (!session || get(activeWorkspaceIdAtom) === session.workspaceId) {
    return;
  }
  const workspace = get(workspacesAtom).find(
    (item) => item.id === session.workspaceId,
  );
  if (!workspace) {
    return;
  }
  set(selectWorkspaceAtom, session.workspaceId);
}

export const activateSessionPaneAtom = atom(
  null,
  (get, set, paneId: string) => {
    set(focusSessionPaneAtom, paneId);
    const pane = findPane(get(sessionSplitLayoutAtom), paneId);
    if (pane?.sessionId) {
      activateWorkspaceForSession(get, set, pane.sessionId);
    }
  },
);

export const selectSessionAtom = atom(
  null,
  (get, set, sessionId: string | null) => {
    set(bindFocusedPaneContentAtom, { sessionId });
    if (!sessionId) {
      return;
    }
    activateWorkspaceForSession(get, set, sessionId);
    const ancestorIds = sessionAncestorIds(sessionId, get(sessionsAtom));
    if (ancestorIds.length === 0) {
      return;
    }
    const next = new Set(get(collapsedSessionIdsAtom));
    let changed = false;
    for (const ancestorId of ancestorIds) {
      if (next.delete(ancestorId)) {
        changed = true;
      }
    }
    if (changed) {
      set(collapsedSessionIdsAtom, next);
    }
  },
);

export const openSessionInSplitAtom = atom(
  null,
  (
    get,
    set,
    payload: { sessionId: string; direction: SessionSplitDirection },
  ) => {
    if (
      !findPaneIdBySessionId(get(sessionSplitLayoutAtom), payload.sessionId)
    ) {
      const createdPane = set(splitFocusedPaneAtom, payload.direction);
      if (!createdPane) {
        return;
      }
    }
    set(selectSessionAtom, payload.sessionId);
  },
);

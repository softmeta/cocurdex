import {
  type AgentId,
  type AgentPermissionMode,
  type AgentProviderSnapshot,
  type AgentToolCallRecord,
  childSessionFromSubagentToolCall,
  collectSessionSubtreeIds,
  mergeProjectedSubagentSession,
  type SessionRecord,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import {
  agentsAtom,
  getDefaultPermissionMode,
  getDefaultSessionTitle,
  getDefaultWriteMode,
  lastSelectedAgentAtom,
  supportsPermissionMode,
  supportsPermissionModeForModel,
  supportsSessionMode,
} from "./session-agent-state";
import {
  activateWorkspaceForSession,
  activeSessionIdAtom,
  getNextActiveSessionId,
  selectSessionAtom,
  sessionsAtom,
} from "./session-navigation-state";
import {
  beginSessionSend,
  keepSendingSessionsRunning,
  type SessionSendsInFlight,
  settleSessionSend,
} from "./session-sends-in-flight";
import {
  bindFocusedPaneContentAtom,
  clearRemovedPaneSessionsAtom,
  resetSessionSplitLayoutAtom,
} from "./session-split/session-split-store";

export {
  agentLabels,
  agentsAtom,
  applyAgentSessionModesAtom,
  availableAgentsAtom,
  bootstrapAgentsAtom,
  getAgentDisplayLabel,
  getDefaultPermissionMode,
  getDefaultSessionTitle,
  getPermissionModeOptions,
  getSessionModeOptions,
  getSessionPermissionMode,
  isDefaultSessionTitle,
  lastSelectedAgentAtom,
  supportsLivePermissionMode,
  supportsPermissionMode,
  supportsPermissionModeForModel,
  supportsPlanMode,
  supportsSessionMode,
} from "./session-agent-state";

export {
  activateSessionPaneAtom,
  activeSessionIdAtom,
  collapsedSessionIdsAtom,
  openSessionInSplitAtom,
  selectSessionAtom,
  sessionsAtom,
  toggleSessionCollapsedAtom,
} from "./session-navigation-state";
export {
  updateSessionAgentAtom,
  updateSessionModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
} from "./session-runtime-state";

export const sessionRunStartedAtAtom = atom<Record<string, number>>({});

function compareSessionsByRecency(
  left: SessionRecord,
  right: SessionRecord,
): number {
  const leftValue = left.lastMessageAt ?? left.createdAt;
  const rightValue = right.lastMessageAt ?? right.createdAt;

  return rightValue.localeCompare(leftValue);
}

const sessionSendsInFlightAtom = atom<SessionSendsInFlight>({});

export const reconcileSessionsAtom = atom(
  null,
  (get, set, sessions: SessionRecord[]) => {
    const held = keepSendingSessionsRunning(
      sessions,
      get(sessionsAtom),
      get(sessionSendsInFlightAtom),
    );
    set(sessionsAtom, held.sort(compareSessionsByRecency));
  },
);

export const beginSessionSendAtom = atom(
  null,
  (get, set, sessionId: string) => {
    set(
      sessionSendsInFlightAtom,
      beginSessionSend(get(sessionSendsInFlightAtom), sessionId),
    );
    set(updateSessionStatusAtom, { sessionId, status: "running" });
  },
);

export const settleSessionSendAtom = atom(
  null,
  (get, set, sessionId: string) => {
    set(
      sessionSendsInFlightAtom,
      settleSessionSend(get(sessionSendsInFlightAtom), sessionId),
    );
  },
);

export const mergeSessionChangesAtom = atom(
  null,
  (
    get,
    set,
    changes: { sessions: SessionRecord[]; removedSessionIds: string[] },
  ) => {
    const changed = new Map(
      changes.sessions.map((session) => [session.id, session]),
    );
    const removed = new Set(changes.removedSessionIds);
    const kept = get(sessionsAtom).filter(
      (session) => !removed.has(session.id) && !changed.has(session.id),
    );
    const active = changes.sessions.filter((session) => !session.archivedAt);
    set(reconcileSessionsAtom, [...kept, ...active]);
  },
);

export const bootstrapSessionsAtom = atom(
  null,
  (_get, set, sessions: SessionRecord[]) => {
    set(reconcileSessionsAtom, sessions);
    set(resetSessionSplitLayoutAtom);
  },
);

export const createDraftSessionAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      workspaceId: string;
      agentType?: AgentId;
      sessionModeId?: string | null;
      permissionMode?: AgentPermissionMode | null;
      agentRoleId?: string | null;
      providerSnapshot?: AgentProviderSnapshot | null;
      worktreePath?: string | null;
    },
  ) => {
    const agentType = payload.agentType ?? get(lastSelectedAgentAtom);
    const agents = get(agentsAtom);
    const requestedModeId = payload.sessionModeId ?? null;
    const requestedPermissionMode =
      payload.permissionMode ?? getDefaultPermissionMode(agents, agentType);
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      workspaceId: payload.workspaceId,
      title: getDefaultSessionTitle(agentType),
      agentType,
      sessionKind: "main",
      parentSessionId: null,
      parentToolCallId: null,
      status: "idle",
      writeMode: getDefaultWriteMode(agentType),
      sessionModeId: supportsSessionMode(agents, agentType, requestedModeId)
        ? requestedModeId
        : null,
      permissionMode:
        supportsPermissionMode(agents, agentType, requestedPermissionMode) &&
        requestedPermissionMode &&
        supportsPermissionModeForModel(
          agentType,
          requestedPermissionMode,
          payload.providerSnapshot,
        )
          ? requestedPermissionMode
          : (getDefaultPermissionMode(agents, agentType) ?? undefined),
      agentRoleId: payload.agentRoleId ?? null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: payload.providerSnapshot ?? null,
      worktreePath: payload.worktreePath ?? null,
    };

    set(sessionsAtom, [session, ...get(sessionsAtom)]);
    set(bindFocusedPaneContentAtom, { sessionId: session.id });
    activateWorkspaceForSession(get, set, session.id);
    set(lastSelectedAgentAtom, agentType);

    return session;
  },
);

export const updateSessionTitleAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      title: string;
      expectedTitle?: string | null;
      updatedAt?: string;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (session.id !== payload.sessionId) {
          return session;
        }

        if (
          payload.expectedTitle !== undefined &&
          session.title !== payload.expectedTitle
        ) {
          updatedSession = session;
          return session;
        }

        updatedSession = {
          ...session,
          title: payload.title,
          updatedAt: payload.updatedAt ?? new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession;
  },
);

export const applyRefinedSessionTitleAtom = atom(
  null,
  (
    _get,
    set,
    payload: {
      expectedTitle: string;
      refinedSession: SessionRecord;
    },
  ) =>
    set(updateSessionTitleAtom, {
      sessionId: payload.refinedSession.id,
      title: payload.refinedSession.title,
      expectedTitle: payload.expectedTitle,
      updatedAt: payload.refinedSession.updatedAt,
    }),
);

export const applySessionUpdateAtom = atom(
  null,
  (get, set, updatedSession: SessionRecord) => {
    set(
      sessionsAtom,
      get(sessionsAtom).map((session) =>
        session.id === updatedSession.id ? updatedSession : session,
      ),
    );
  },
);

export const upsertSessionAtom = atom(
  null,
  (get, set, incoming: SessionRecord) => {
    const current = get(sessionsAtom);
    const existing = current.find((session) => session.id === incoming.id);
    const nextSession: SessionRecord = existing
      ? {
          ...incoming,
          lastMessageAt: incoming.lastMessageAt ?? existing.lastMessageAt,
          pinnedAt:
            incoming.pinnedAt === undefined
              ? existing.pinnedAt
              : incoming.pinnedAt,
        }
      : incoming;
    const [heldSession] = keepSendingSessionsRunning(
      [nextSession],
      current,
      get(sessionSendsInFlightAtom),
    );
    const next = existing
      ? current.map((session) =>
          session.id === incoming.id ? heldSession : session,
        )
      : [heldSession, ...current];

    set(sessionsAtom, next.sort(compareSessionsByRecency));
  },
);

export const projectSubagentSessionFromToolCallAtom = atom(
  null,
  (get, set, toolCall: AgentToolCallRecord) => {
    const parent = get(sessionsAtom).find(
      (session) => session.id === toolCall.sessionId,
    );
    if (!parent) {
      return;
    }
    const child = childSessionFromSubagentToolCall(parent, toolCall);
    if (!child) {
      return;
    }
    const existing = get(sessionsAtom).find(
      (session) => session.id === child.id,
    );
    set(upsertSessionAtom, mergeProjectedSubagentSession(existing, child));
  },
);

export const updateSessionStatusAtom = atom(
  null,
  (
    get,
    set,
    payload: { sessionId: string; status: SessionRecord["status"] },
  ) => {
    const current = get(sessionsAtom).find(
      (session) => session.id === payload.sessionId,
    );
    set(
      sessionsAtom,
      get(sessionsAtom).map((session) =>
        session.id === payload.sessionId
          ? {
              ...session,
              status: payload.status,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );

    if (!current || current.status === payload.status) {
      return;
    }
    if (payload.status === "running") {
      set(sessionRunStartedAtAtom, (previous) => ({
        ...previous,
        [payload.sessionId]: Date.now(),
      }));
    } else if (current.status === "running") {
      set(sessionRunStartedAtAtom, (previous) => {
        const next = { ...previous };
        delete next[payload.sessionId];
        return next;
      });
    }
  },
);

function removeSessionSubtree(get: Getter, set: Setter, sessionId: string) {
  const currentSessions = get(sessionsAtom);
  const removedIds = collectSessionSubtreeIds(currentSessions, sessionId);
  const nextSessions = currentSessions.filter(
    (session) => !removedIds.has(session.id),
  );
  const removed = currentSessions.find((session) => session.id === sessionId);
  const activeSessionId = get(activeSessionIdAtom);

  set(sessionsAtom, nextSessions);
  set(clearRemovedPaneSessionsAtom, removedIds);
  set(sessionRunStartedAtAtom, (previous) => {
    const next = { ...previous };
    for (const id of removedIds) {
      delete next[id];
    }
    return next;
  });

  if (activeSessionId && removedIds.has(activeSessionId)) {
    set(selectSessionAtom, getNextActiveSessionId(nextSessions, removed));
  }
}

export const setSessionPinnedAtom = atom(
  null,
  (get, set, payload: { sessionId: string; pinnedAt: string | null }) => {
    set(
      sessionsAtom,
      get(sessionsAtom).map((session) =>
        session.id === payload.sessionId
          ? { ...session, pinnedAt: payload.pinnedAt }
          : session,
      ),
    );
  },
);

export const archiveSessionAtom = atom(
  null,
  (get, set, payload: { sessionId: string; archivedAt?: string }) => {
    removeSessionSubtree(get, set, payload.sessionId);
  },
);

export const deleteSessionAtom = atom(
  null,
  (get, set, payload: { sessionId: string }) => {
    removeSessionSubtree(get, set, payload.sessionId);
  },
);

export const removeSessionsByWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const current = get(sessionsAtom);
    const next = current.filter(
      (session) => session.workspaceId !== workspaceId,
    );
    set(sessionsAtom, next);
    const removedIds = new Set(
      current
        .filter((session) => session.workspaceId === workspaceId)
        .map((session) => session.id),
    );
    set(clearRemovedPaneSessionsAtom, removedIds);
  },
);

export const markSessionMessageAtom = atom(
  null,
  (get, set, payload: { sessionId: string; createdAt: string }) => {
    set(
      sessionsAtom,
      [...get(sessionsAtom)]
        .map((session) =>
          session.id === payload.sessionId
            ? {
                ...session,
                updatedAt: payload.createdAt,
                lastMessageAt: payload.createdAt,
              }
            : session,
        )
        .sort(compareSessionsByRecency),
    );
  },
);

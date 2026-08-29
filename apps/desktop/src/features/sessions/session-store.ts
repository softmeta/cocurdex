import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionMode,
  AgentPermissionModeOption,
  AgentProviderSnapshot,
  AgentThinkingLevel,
  CollaborationModeKind,
  ReasoningEffort,
  SessionRecord,
} from "@cocurdex/shared";
import {
  agentRuntimeAxisCapabilities,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
  isAgentPermissionModeSupportedForModel,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { i18n } from "@/i18n";
import { resources } from "@/i18n/resources";
import { isAgentReadyToStart } from "./adapter-status";

export const sessionsAtom = atom<SessionRecord[]>([]);
export const activeSessionIdAtom = atom<string | null>(null);
const LAST_SELECTED_AGENT_STORAGE_KEY = "agents.desktop.last-selected-agent";
// Prefer the same order as the new-session agent picker.
const agentFallbackOrder: AgentId[] = [
  "pi",
  "grok-build",
  "codex",
  "claude-agent",
  "opencode",
];

export const agentLabels: Record<AgentId, string> = {
  "claude-agent": "Claude Agent",
  codex: "Codex",
  "grok-build": "Grok Build",
  opencode: "OpenCode",
  pi: "Pi",
};

export const agentCollaborationModes: Record<AgentId, CollaborationModeKind[]> =
  {
    "claude-agent": ["default", "plan"],
    codex: ["default", "plan"],
    "grok-build": ["default", "plan"],
    opencode: ["default", "plan"],
    pi: ["default"],
  };

// CLI 适配器启动时没有 installation 记录，选择器显示「检测中」；
// listAgents 返回前不要把这个空窗当成已经装好。
export const agentsAtom = atom<AgentDescriptor[]>([
  {
    id: "claude-agent",
    label: "Claude Agent",
    availability: "available",
    capabilities: {
      collaborationModes: ["default", "plan"],
      permissionModes: getFallbackAgentPermissionModes("claude-agent"),
      writeModes: ["read-only", "native-write"],
      supportsSteering: true,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: getAgentSessionTitleStrategy("claude-agent"),
      transport: "native",
      runtimeAxes: agentRuntimeAxisCapabilities["claude-agent"],
    },
  },
  {
    id: "codex",
    label: "Codex",
    availability: "available",
    capabilities: {
      collaborationModes: ["default", "plan"],
      permissionModes: getFallbackAgentPermissionModes("codex"),
      writeModes: ["read-only"],
      supportsSteering: true,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: getAgentSessionTitleStrategy("codex"),
      transport: "native",
      runtimeAxes: agentRuntimeAxisCapabilities.codex,
    },
  },
  {
    id: "grok-build",
    label: "Grok Build",
    availability: "available",
    capabilities: {
      collaborationModes: ["default", "plan"],
      permissionModes: getFallbackAgentPermissionModes("grok-build"),
      writeModes: ["native-write"],
      supportsSteering: false,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: getAgentSessionTitleStrategy("grok-build"),
      transport: "acp",
      runtimeAxes: agentRuntimeAxisCapabilities["grok-build"],
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    availability: "available",
    capabilities: {
      collaborationModes: ["default", "plan"],
      permissionModes: getFallbackAgentPermissionModes("opencode"),
      writeModes: ["read-only", "native-write"],
      supportsSteering: false,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: getAgentSessionTitleStrategy("opencode"),
      transport: "native",
      runtimeAxes: agentRuntimeAxisCapabilities.opencode,
    },
  },
  {
    id: "pi",
    label: "Pi",
    availability: "available",
    capabilities: {
      collaborationModes: ["default"],
      permissionModes: getFallbackAgentPermissionModes("pi"),
      writeModes: ["read-only"],
      supportsSteering: true,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: getAgentSessionTitleStrategy("pi"),
      transport: "native",
      runtimeAxes: agentRuntimeAxisCapabilities.pi,
    },
  },
]);

export const availableAgentsAtom = atom((get) =>
  get(agentsAtom).filter(isAgentReadyToStart),
);

export const bootstrapAgentsAtom = atom(
  null,
  (_get, set, agents: AgentDescriptor[]) => {
    set(agentsAtom, agents);
  },
);

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && value in agentLabels;
}

function normalizeAgentId(agentType: unknown): AgentId {
  return isAgentId(agentType) ? agentType : "codex";
}

function getAgentLabel(agentType: unknown) {
  return i18n.t(`common:agents.${agentTypeToKey(agentType)}`);
}

function agentTypeToKey(agentType: unknown) {
  const normalizedAgentType = normalizeAgentId(agentType);

  if (normalizedAgentType === "claude-agent") {
    return "claudeCli";
  }

  if (normalizedAgentType === "grok-build") {
    return "grokBuild";
  }

  return normalizedAgentType;
}

export function getDefaultSessionTitle(agentType: unknown) {
  return i18n.t("sessions:defaultTitle", {
    agentLabel: getAgentLabel(agentType),
  });
}

export function isDefaultSessionTitle(title: string, agentType: AgentId) {
  const normalizedTitle = title.trim();
  const agentKey = agentTypeToKey(agentType);
  const localizedDefaultTitles = Object.values(resources).map(
    ({ common, sessions }) =>
      sessions.defaultTitle.replace("{{agentLabel}}", common.agents[agentKey]),
  );

  return (
    normalizedTitle === getDefaultSessionTitle(agentType) ||
    localizedDefaultTitles.includes(normalizedTitle)
  );
}

function getDefaultWriteMode(agentType: unknown): SessionRecord["writeMode"] {
  const normalizedAgentType = normalizeAgentId(agentType);
  return normalizedAgentType === "claude-agent" ||
    normalizedAgentType === "grok-build"
    ? "native-write"
    : "read-only";
}

export function getPermissionModeOptions(
  agents: AgentDescriptor[],
  agentType: unknown,
): AgentPermissionModeOption[] {
  return (
    agents.find((agent) => agent.id === normalizeAgentId(agentType))
      ?.capabilities.permissionModes ?? []
  );
}

export function getDefaultPermissionMode(
  agents: AgentDescriptor[],
  agentType: unknown,
) {
  return getPermissionModeOptions(agents, agentType)[0]?.id ?? null;
}

function supportsCollaborationMode(
  agentType: unknown,
  mode: CollaborationModeKind,
) {
  return agentCollaborationModes[normalizeAgentId(agentType)].includes(mode);
}

// Adapters that honor permission changes after session creation. The current
// choice is carried into the next turn and applied through the live adapter
// transport; no adapter uses a restart-session fallback.
export function supportsLivePermissionMode(agentType: unknown) {
  const normalizedAgentType = normalizeAgentId(agentType);
  return supportsInSessionRuntimeAxis(normalizedAgentType, "permission");
}

export function supportsPermissionMode(
  agents: AgentDescriptor[],
  agentType: unknown,
  mode: AgentPermissionMode | null | undefined,
) {
  return Boolean(
    mode &&
      getPermissionModeOptions(agents, agentType).some(
        (option) => option.id === mode,
      ),
  );
}

export function supportsPermissionModeForModel(
  agentType: unknown,
  mode: AgentPermissionMode,
  providerSnapshot?: AgentProviderSnapshot | null,
) {
  return isAgentPermissionModeSupportedForModel(
    normalizeAgentId(agentType),
    mode,
    providerSnapshot?.modelId,
    providerSnapshot?.modelName,
  );
}

export function getSessionPermissionMode(
  agents: AgentDescriptor[],
  session: SessionRecord,
) {
  return supportsPermissionMode(
    agents,
    session.agentType,
    session.permissionMode,
  ) &&
    session.permissionMode &&
    supportsPermissionModeForModel(
      session.agentType,
      session.permissionMode,
      session.providerSnapshot,
    )
    ? session.permissionMode
    : getDefaultPermissionMode(agents, session.agentType);
}

function getNextActiveSessionId(sessions: SessionRecord[], sessionId: string) {
  return sessions.find((session) => session.id !== sessionId)?.id ?? null;
}

// Built-in default is cocurdex (agent id `pi`). Unknown or missing storage
// values fall back here so first-run and corrupt prefs stay on the built-in.
const DEFAULT_LAST_SELECTED_AGENT: AgentId = "pi";

function getLastSelectedAgentStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStoredLastSelectedAgent(): AgentId {
  const storage = getLastSelectedAgentStorage();
  if (!storage) {
    return DEFAULT_LAST_SELECTED_AGENT;
  }

  try {
    const storedAgent = storage.getItem(LAST_SELECTED_AGENT_STORAGE_KEY);
    return isAgentId(storedAgent) ? storedAgent : DEFAULT_LAST_SELECTED_AGENT;
  } catch {
    return DEFAULT_LAST_SELECTED_AGENT;
  }
}

function persistLastSelectedAgent(agentType: AgentId) {
  const storage = getLastSelectedAgentStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LAST_SELECTED_AGENT_STORAGE_KEY, agentType);
  } catch {
    // Quota / private mode — in-memory atom still holds the choice for the
    // current session; next cold start falls back to the built-in default.
  }
}

const lastSelectedAgentBaseAtom = atom<AgentId>(getStoredLastSelectedAgent());

function getFirstAvailableAgent(agents: AgentDescriptor[]) {
  return (
    agentFallbackOrder.find((agentId) =>
      agents.some(
        (agent) => agent.id === agentId && isAgentReadyToStart(agent),
      ),
    ) ?? null
  );
}

// Last agent the user picked on the new-session card. Seeded from
// localStorage (survives restart); writes update both memory and storage so
// the next visit — same session or after relaunch — restores the choice.
// Default when nothing is stored: built-in cocurdex (`pi`).
export const lastSelectedAgentAtom = atom(
  (get) => {
    const selectedAgent = get(lastSelectedAgentBaseAtom);
    const agents = get(agentsAtom);
    const selectedAgentAvailable = agents.some(
      (agent) => agent.id === selectedAgent && isAgentReadyToStart(agent),
    );

    return selectedAgentAvailable
      ? selectedAgent
      : (getFirstAvailableAgent(agents) ?? selectedAgent);
  },
  (_get, set, agentType: AgentId) => {
    set(lastSelectedAgentBaseAtom, agentType);
    persistLastSelectedAgent(agentType);
  },
);

// Sort newest-first by last message. Fall back to the immutable createdAt (not
// updatedAt) so settings-only edits — agent, collaboration mode, permission
// mode, rename — don't reorder a session that hasn't received a message yet.
function compareSessionsByRecency(
  left: SessionRecord,
  right: SessionRecord,
): number {
  const leftValue = left.lastMessageAt ?? left.createdAt;
  const rightValue = right.lastMessageAt ?? right.createdAt;

  return rightValue.localeCompare(leftValue);
}

export const bootstrapSessionsAtom = atom(
  null,
  (_get, set, sessions: SessionRecord[]) => {
    const sorted = [...sessions].sort(compareSessionsByRecency);

    set(sessionsAtom, sorted);
    // Deliberately no auto-selection: selecting the most recent session on cold
    // start loads and renders its whole transcript right after the first paint,
    // which blocks the renderer's main thread (hover, menus) for seconds on a
    // long history. Launch lands on the new-session surface instead; the
    // sidebar is one click away.
    set(activeSessionIdAtom, null);
  },
);

export const selectSessionAtom = atom(
  null,
  (_get, set, sessionId: string | null) => {
    set(activeSessionIdAtom, sessionId);
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
      collaborationMode?: CollaborationModeKind;
      permissionMode?: AgentPermissionMode | null;
      providerSnapshot?: AgentProviderSnapshot | null;
    },
  ) => {
    const agentType = payload.agentType ?? get(lastSelectedAgentAtom);
    const agents = get(agentsAtom);
    const requestedMode = payload.collaborationMode ?? "default";
    const requestedPermissionMode =
      payload.permissionMode ?? getDefaultPermissionMode(agents, agentType);
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      workspaceId: payload.workspaceId,
      title: getDefaultSessionTitle(agentType),
      agentType,
      status: "idle",
      writeMode: getDefaultWriteMode(agentType),
      collaborationMode: supportsCollaborationMode(agentType, requestedMode)
        ? requestedMode
        : "default",
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
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: payload.providerSnapshot ?? null,
    };

    set(sessionsAtom, [session, ...get(sessionsAtom)]);
    set(activeSessionIdAtom, session.id);
    set(lastSelectedAgentAtom, agentType);

    return session;
  },
);

export const updateSessionAgentAtom = atom(
  null,
  (get, set, payload: { sessionId: string; agentType: AgentId }) => {
    set(
      sessionsAtom,
      get(sessionsAtom).map((session) =>
        session.id === payload.sessionId
          ? {
              ...session,
              agentType: payload.agentType,
              title: getDefaultSessionTitle(payload.agentType),
              updatedAt: new Date().toISOString(),
              writeMode: getDefaultWriteMode(payload.agentType),
              collaborationMode: supportsCollaborationMode(
                payload.agentType,
                session.collaborationMode,
              )
                ? session.collaborationMode
                : "default",
              permissionMode:
                getDefaultPermissionMode(get(agentsAtom), payload.agentType) ??
                undefined,
            }
          : session,
      ),
    );
    set(lastSelectedAgentAtom, payload.agentType);
  },
);

export const updateSessionCollaborationModeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      collaborationMode: CollaborationModeKind;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (
          session.id !== payload.sessionId ||
          !supportsCollaborationMode(
            session.agentType,
            payload.collaborationMode,
          )
        ) {
          return session;
        }

        updatedSession = {
          ...session,
          collaborationMode: payload.collaborationMode,
          permissionMode:
            payload.collaborationMode === "default" &&
            session.permissionMode === "claude-plan"
              ? "claude-default"
              : session.permissionMode,
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession;
  },
);

export const updateSessionPermissionModeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      permissionMode: AgentPermissionMode;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (
          session.id !== payload.sessionId ||
          !supportsPermissionMode(
            get(agentsAtom),
            session.agentType,
            payload.permissionMode,
          ) ||
          !supportsPermissionModeForModel(
            session.agentType,
            payload.permissionMode,
            session.providerSnapshot,
          )
        ) {
          return session;
        }

        updatedSession = {
          ...session,
          permissionMode: payload.permissionMode,
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession;
  },
);

// Runtime axes live in the provider snapshot so the composer, logs, and
// adapter payload describe the same active session configuration. Only the
// provided fields change.
export const updateSessionProviderRuntimeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      reasoningEffort?: ReasoningEffort | null;
      serviceTier?: string | null;
      fastMode?: boolean | null;
      thinkingLevel?: AgentThinkingLevel | null;
      openCodeAgent?: string | null;
      openCodeVariant?: string | null;
      providerSnapshot?: AgentProviderSnapshot;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (
          session.id !== payload.sessionId ||
          (!session.providerSnapshot && !payload.providerSnapshot)
        ) {
          return session;
        }

        let providerSnapshot = session.providerSnapshot;
        if (payload.providerSnapshot) {
          providerSnapshot = providerSnapshot
            ? { ...providerSnapshot, ...payload.providerSnapshot }
            : payload.providerSnapshot;
        }
        if (!providerSnapshot) {
          return session;
        }

        updatedSession = {
          ...session,
          providerSnapshot: {
            ...providerSnapshot,
            ...(payload.providerSnapshot ?? {}),
            ...("reasoningEffort" in payload
              ? { reasoningEffort: payload.reasoningEffort ?? null }
              : {}),
            ...("serviceTier" in payload
              ? { serviceTier: payload.serviceTier ?? null }
              : {}),
            ...("fastMode" in payload
              ? { fastMode: payload.fastMode ?? null }
              : {}),
            ...("thinkingLevel" in payload
              ? { thinkingLevel: payload.thinkingLevel ?? null }
              : {}),
            ...("openCodeAgent" in payload
              ? { openCodeAgent: payload.openCodeAgent ?? null }
              : {}),
            ...("openCodeVariant" in payload
              ? { openCodeVariant: payload.openCodeVariant ?? null }
              : {}),
          },
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    // TS narrows `updatedSession` to null because the assignment happens in a
    // callback; the annotation is what callers actually get back.
    return updatedSession as SessionRecord | null;
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

export const updateSessionStatusAtom = atom(
  null,
  (
    get,
    set,
    payload: { sessionId: string; status: SessionRecord["status"] },
  ) => {
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
  },
);

export const archiveSessionAtom = atom(
  null,
  (get, set, payload: { sessionId: string; archivedAt?: string }) => {
    const currentSessions = get(sessionsAtom);
    const nextSessions = currentSessions.filter(
      (session) => session.id !== payload.sessionId,
    );

    set(sessionsAtom, nextSessions);

    if (get(activeSessionIdAtom) === payload.sessionId) {
      set(
        activeSessionIdAtom,
        getNextActiveSessionId(currentSessions, payload.sessionId),
      );
    }
  },
);

export const deleteSessionAtom = atom(
  null,
  (get, set, payload: { sessionId: string }) => {
    const currentSessions = get(sessionsAtom);
    const nextSessions = currentSessions.filter(
      (session) => session.id !== payload.sessionId,
    );

    set(sessionsAtom, nextSessions);

    if (get(activeSessionIdAtom) === payload.sessionId) {
      set(
        activeSessionIdAtom,
        getNextActiveSessionId(currentSessions, payload.sessionId),
      );
    }
  },
);

// Bulk-remove every session belonging to a workspace. Used when a workspace
// is removed from the app so its sessions vanish from the sidebar without
// requiring a full re-bootstrap.
export const removeSessionsByWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const current = get(sessionsAtom);
    const next = current.filter(
      (session) => session.workspaceId !== workspaceId,
    );
    set(sessionsAtom, next);
    const activeId = get(activeSessionIdAtom);
    if (
      activeId &&
      current.find((session) => session.id === activeId)?.workspaceId ===
        workspaceId
    ) {
      set(activeSessionIdAtom, next[0]?.id ?? null);
    }
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

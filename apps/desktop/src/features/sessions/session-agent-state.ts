import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AgentDescriptor,
  type AgentId,
  type AgentPermissionMode,
  type AgentPermissionModeOption,
  type AgentProviderSnapshot,
  type AgentSessionMode,
  agentRuntimeAxisCapabilities,
  type BuiltInAgentId,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
  isAcpRegistryAgentId,
  isAgentId,
  isAgentPermissionModeSupportedForModel,
  isPlanModeId,
  PLAN_MODE_ID,
  type SessionRecord,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { i18n } from "@/i18n";
import { resources } from "@/i18n/resources";
import { isAgentReadyToStart } from "./adapter-status";

const LAST_SELECTED_AGENT_STORAGE_KEY = "agents.desktop.last-selected-agent";
// Prefer the same order as the new-session agent picker.
const agentFallbackOrder: AgentId[] = [
  "pi",
  "codex",
  "claude-agent",
  "opencode",
];

export const agentLabels: Record<BuiltInAgentId, string> = {
  "claude-agent": "Claude Agent",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi",
};

function planSessionModes(): AgentSessionMode[] {
  return [
    { id: "default", name: "Default" },
    { id: PLAN_MODE_ID, name: "Plan" },
  ];
}

// CLI 适配器启动时没有 installation 记录，选择器显示「检测中」；
// listAgents 返回前不要把这个空窗当成已经装好。
export const agentsAtom = atom<AgentDescriptor[]>([
  {
    id: "claude-agent",
    label: "Claude Agent",
    availability: "available",
    capabilities: {
      sessionModes: planSessionModes(),
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
      sessionModes: planSessionModes(),
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
    id: "opencode",
    label: "OpenCode",
    availability: "available",
    capabilities: {
      sessionModes: planSessionModes(),
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
      sessionModes: [],
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

const registryAgentLabels = new Map<AgentId, string>();

export function getAgentDisplayLabel(agentId: AgentId) {
  if (isAcpRegistryAgentId(agentId)) {
    return (
      registryAgentLabels.get(agentId) ??
      agentId.slice(ACP_REGISTRY_AGENT_ID_PREFIX.length)
    );
  }
  return agentLabels[agentId] ?? agentId;
}

export const bootstrapAgentsAtom = atom(
  null,
  (_get, set, agents: AgentDescriptor[]) => {
    for (const agent of agents) {
      if (isAcpRegistryAgentId(agent.id)) {
        registryAgentLabels.set(agent.id, agent.label);
      }
    }
    set(agentsAtom, agents);
  },
);

export const applyAgentSessionModesAtom = atom(
  null,
  (
    get,
    set,
    payload: { agentId: AgentId; sessionModes: AgentSessionMode[] },
  ) => {
    set(
      agentsAtom,
      get(agentsAtom).map((agent) =>
        agent.id === payload.agentId
          ? {
              ...agent,
              capabilities: {
                ...agent.capabilities,
                sessionModes: payload.sessionModes,
              },
            }
          : agent,
      ),
    );
  },
);

function normalizeAgentId(agentType: unknown): AgentId {
  return typeof agentType === "string" && isAgentId(agentType)
    ? agentType
    : "codex";
}

function getAgentLabel(agentType: unknown) {
  const agentId = normalizeAgentId(agentType);
  return isAcpRegistryAgentId(agentId)
    ? getAgentDisplayLabel(agentId)
    : i18n.t(`common:agents.${agentTypeToKey(agentId)}`);
}

function agentTypeToKey(normalizedAgentType: BuiltInAgentId) {
  if (normalizedAgentType === "claude-agent") {
    return "claudeCli";
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
  if (isAcpRegistryAgentId(agentType)) {
    return normalizedTitle === getDefaultSessionTitle(agentType);
  }
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

export function getDefaultWriteMode(
  agentType: unknown,
): SessionRecord["writeMode"] {
  const normalizedAgentType = normalizeAgentId(agentType);
  return isAcpRegistryAgentId(normalizedAgentType) ||
    normalizedAgentType === "claude-agent"
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

export function getSessionModeOptions(
  agents: AgentDescriptor[],
  agentType: unknown,
): AgentSessionMode[] {
  return (
    agents.find((agent) => agent.id === normalizeAgentId(agentType))
      ?.capabilities.sessionModes ?? []
  );
}

export function supportsSessionMode(
  agents: AgentDescriptor[],
  agentType: unknown,
  modeId: string | null | undefined,
) {
  return Boolean(
    modeId &&
      getSessionModeOptions(agents, agentType).some(
        (mode) => mode.id === modeId,
      ),
  );
}

export function supportsPlanMode(
  agents: AgentDescriptor[],
  agentType: unknown,
) {
  return getSessionModeOptions(agents, agentType).some((mode) =>
    isPlanModeId(mode.id),
  );
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
    return storedAgent && isAgentId(storedAgent)
      ? storedAgent
      : DEFAULT_LAST_SELECTED_AGENT;
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

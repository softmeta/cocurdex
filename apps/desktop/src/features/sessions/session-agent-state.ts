import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AgentDescriptor,
  type AgentId,
  type AgentPermissionMode,
  type AgentPermissionModeOption,
  type AgentProviderSnapshot,
  type AgentSessionMode,
  DEFAULT_AGENT_ID,
  getAgentTraits,
  isAcpRegistryAgentId,
  isAgentId,
  isAgentPermissionModeSupportedForModel,
  isPlanModeId,
  type SessionRecord,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { i18n } from "@/i18n";
import { resources } from "@/i18n/resources";
import { isAgentReadyToStart } from "./adapter-status";
import {
  BUILT_IN_AGENT_DISPLAY_ORDER,
  defaultAgentDescriptors,
} from "./agent-options";

const LAST_SELECTED_AGENT_STORAGE_KEY = "agents.desktop.last-selected-agent";
export const agentsAtom = atom<AgentDescriptor[]>(defaultAgentDescriptors);

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
  return getAgentTraits(agentId).label;
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
  return (typeof agentType === "string" ? agentType : "") as AgentId;
}

export function getDefaultSessionTitle(agentType: unknown) {
  return i18n.t("sessions:defaultTitle", {
    agentLabel: getAgentDisplayLabel(normalizeAgentId(agentType)),
  });
}

export function isDefaultSessionTitle(title: string, agentType: AgentId) {
  const normalizedTitle = title.trim();
  const agentLabel = getAgentDisplayLabel(agentType);
  return Object.values(resources).some(
    ({ sessions }) =>
      sessions.defaultTitle.replace("{{agentLabel}}", agentLabel) ===
      normalizedTitle,
  );
}

export function getDefaultWriteMode(
  agentType: unknown,
): SessionRecord["writeMode"] {
  return getAgentTraits(normalizeAgentId(agentType)).defaultWriteMode;
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
    return DEFAULT_AGENT_ID;
  }

  try {
    const storedAgent = storage.getItem(LAST_SELECTED_AGENT_STORAGE_KEY);
    return storedAgent && isAgentId(storedAgent)
      ? storedAgent
      : DEFAULT_AGENT_ID;
  } catch {
    return DEFAULT_AGENT_ID;
  }
}

function persistLastSelectedAgent(agentType: AgentId) {
  const storage = getLastSelectedAgentStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LAST_SELECTED_AGENT_STORAGE_KEY, agentType);
  } catch {}
}

const lastSelectedAgentBaseAtom = atom<AgentId>(getStoredLastSelectedAgent());

export function getFirstAvailableAgent(
  agents: readonly AgentDescriptor[],
): AgentId | null {
  const ready = agents.filter(isAgentReadyToStart);
  return (
    BUILT_IN_AGENT_DISPLAY_ORDER.find((agentId) =>
      ready.some((agent) => agent.id === agentId),
    ) ??
    ready[0]?.id ??
    null
  );
}

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

import { getAcpAgentProfile } from "./acp-agent-profiles";
import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import {
  type AgentTraits,
  type BuiltInAgentManifest,
  builtInAgentManifests,
} from "./built-in-agents";
import {
  type AgentCapabilities,
  type AgentDescriptor,
  type AgentId,
  type AgentRuntimeAxisCapabilities,
  type AgentSessionMode,
  BUILT_IN_AGENT_IDS,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
  PLAN_MODE_ID,
} from "./contracts";

export type {
  AgentModelCatalog,
  AgentModelIdentity,
  AgentSkillConvention,
  AgentThinkingLevelSource,
  AgentTraits,
  BuiltInAgentManifest,
} from "./built-in-agents";
export { builtInAgentManifests } from "./built-in-agents";

const inSession = "in-session" as const;

const acpRegistryRuntimeAxes: AgentRuntimeAxisCapabilities = {
  model: inSession,
  thinking: inSession,
  speed: inSession,
};

function acpRegistryAgentTraits(agentId: AgentId): AgentTraits {
  const profile = getAcpAgentProfile(agentId);
  return {
    label: agentId,
    transport: "acp",
    planMode: false,
    writeModes: ["native-write"],
    defaultWriteMode: "native-write",
    supportsSteering: profile.supportsSteering ?? false,
    sessionTitleStrategy: "native",
    runtimeAxes: profile.runtimeAxes ?? acpRegistryRuntimeAxes,
    thinkingLevels: "adapter",
    fastMode: false,
    documentAttachments: profile.documentAttachments === true,
    modelCatalog: "agent",
    toolApprovals: true,
    disableable: true,
    planUsage: profile.planUsage === true,
  };
}

function retiredAgentTraits(agentId: AgentId): AgentTraits {
  return {
    label: agentId,
    transport: "native",
    planMode: false,
    writeModes: ["read-only"],
    defaultWriteMode: "read-only",
    supportsSteering: false,
    sessionTitleStrategy: "native",
    runtimeAxes: {},
    thinkingLevels: null,
    fastMode: false,
    documentAttachments: false,
    modelCatalog: "agent",
    toolApprovals: true,
    disableable: true,
    planUsage: false,
  };
}

export function isBuiltInAgentId(agentId: string): agentId is BuiltInAgentId {
  return Object.hasOwn(builtInAgentManifests, agentId);
}

export function getBuiltInAgentManifest(
  agentId: AgentId,
): BuiltInAgentManifest | null {
  return isBuiltInAgentId(agentId) ? builtInAgentManifests[agentId] : null;
}

export function getAgentTraits(agentId: AgentId): AgentTraits {
  if (isAcpRegistryAgentId(agentId)) return acpRegistryAgentTraits(agentId);
  return getBuiltInAgentManifest(agentId) ?? retiredAgentTraits(agentId);
}

export function canDisableAgent(agentId: AgentId): boolean {
  return getAgentTraits(agentId).disableable;
}

export function supportsPlanUsage(agentId: AgentId): boolean {
  return getAgentTraits(agentId).planUsage;
}

export function findBuiltInAgentByRsrsHost(
  host: string,
): BuiltInAgentId | null {
  return (
    BUILT_IN_AGENT_IDS.find(
      (agentId) => builtInAgentManifests[agentId].rsrsHost === host,
    ) ?? null
  );
}

export function findBuiltInAgentForAcpRegistryId(
  registryId: string,
): BuiltInAgentId | null {
  return (
    BUILT_IN_AGENT_IDS.find((agentId) =>
      builtInAgentManifests[agentId].acpRegistryEquivalents.includes(
        registryId,
      ),
    ) ?? null
  );
}

function planSessionModes(): AgentSessionMode[] {
  return [
    { id: "default", name: "Default" },
    { id: PLAN_MODE_ID, name: "Plan" },
  ];
}

export function getFallbackAgentCapabilities(
  agentId: AgentId,
): AgentCapabilities {
  const traits = getAgentTraits(agentId);
  const profile = isAcpRegistryAgentId(agentId)
    ? getAcpAgentProfile(agentId)
    : null;
  const planModes = traits.planMode ? planSessionModes() : [];
  return {
    sessionModes:
      profile?.sessionModes?.map((mode) => ({ ...mode })) ?? planModes,
    permissionModes: getFallbackAgentPermissionModes(agentId),
    writeModes: [...traits.writeModes],
    supportsSteering: traits.supportsSteering,
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: traits.sessionTitleStrategy,
    transport: traits.transport,
    runtimeAxes: { ...traits.runtimeAxes },
  };
}

export function getBuiltInAgentDescriptor(
  agentId: BuiltInAgentId,
): AgentDescriptor {
  return {
    id: agentId,
    label: builtInAgentManifests[agentId].label,
    availability: "available",
    capabilities: getFallbackAgentCapabilities(agentId),
  };
}

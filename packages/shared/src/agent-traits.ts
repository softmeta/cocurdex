import { getAcpAgentProfile } from "./acp-agent-profiles";
import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import {
  type AgentCapabilities,
  type AgentDescriptor,
  type AgentId,
  type AgentRuntimeAxisCapabilities,
  type AgentSessionMode,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
  PLAN_MODE_ID,
  type SessionTitleStrategy,
  type WriteMode,
} from "./contracts";

export type AgentThinkingLevelSource = "reasoning-effort" | "app" | "adapter";

export type AgentModelCatalog = "agent" | "agent-providers" | "app-providers";

export interface AgentTraits {
  label: string;
  transport: AgentCapabilities["transport"];
  planMode: boolean;
  writeModes: readonly WriteMode[];
  defaultWriteMode: WriteMode;
  supportsSteering: boolean;
  sessionTitleStrategy: SessionTitleStrategy;
  runtimeAxes: AgentRuntimeAxisCapabilities;
  thinkingLevels: AgentThinkingLevelSource | null;
  fastMode: boolean;
  documentAttachments: boolean;
  modelCatalog: AgentModelCatalog;
  toolApprovals: boolean;
}

const inSession = "in-session" as const;

const builtInAgentTraits: Readonly<Record<BuiltInAgentId, AgentTraits>> = {
  "claude-agent": {
    label: "Claude Agent",
    transport: "native",
    planMode: true,
    writeModes: ["read-only", "native-write"],
    defaultWriteMode: "native-write",
    supportsSteering: true,
    sessionTitleStrategy: "adapter-generated",
    runtimeAxes: {
      model: inSession,
      thinking: inSession,
      permission: inSession,
      speed: inSession,
    },
    thinkingLevels: "adapter",
    fastMode: true,
    documentAttachments: true,
    modelCatalog: "agent",
    toolApprovals: true,
  },
  codex: {
    label: "Codex",
    transport: "native",
    planMode: true,
    writeModes: ["read-only", "native-write"],
    defaultWriteMode: "read-only",
    supportsSteering: true,
    sessionTitleStrategy: "adapter-generated",
    runtimeAxes: {
      model: inSession,
      thinking: inSession,
      permission: inSession,
      speed: inSession,
    },
    thinkingLevels: "reasoning-effort",
    fastMode: false,
    documentAttachments: false,
    modelCatalog: "agent",
    toolApprovals: true,
  },
  opencode: {
    label: "OpenCode",
    transport: "native",
    planMode: true,
    writeModes: ["read-only", "native-write"],
    defaultWriteMode: "read-only",
    supportsSteering: false,
    sessionTitleStrategy: "native",
    runtimeAxes: {
      model: inSession,
      agent: inSession,
      variant: inSession,
      permission: inSession,
    },
    thinkingLevels: null,
    fastMode: false,
    documentAttachments: true,
    modelCatalog: "agent-providers",
    toolApprovals: true,
  },
  pi: {
    label: "Pi",
    transport: "native",
    planMode: false,
    writeModes: ["read-only"],
    defaultWriteMode: "read-only",
    supportsSteering: true,
    sessionTitleStrategy: "app-generated",
    runtimeAxes: { model: inSession, thinking: inSession },
    thinkingLevels: "app",
    fastMode: false,
    documentAttachments: false,
    modelCatalog: "app-providers",
    toolApprovals: false,
  },
};

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
  };
}

export function getAgentTraits(agentId: AgentId): AgentTraits {
  if (isAcpRegistryAgentId(agentId)) return acpRegistryAgentTraits(agentId);
  return Object.hasOwn(builtInAgentTraits, agentId)
    ? builtInAgentTraits[agentId]
    : retiredAgentTraits(agentId);
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
    label: builtInAgentTraits[agentId].label,
    availability: "available",
    capabilities: getFallbackAgentCapabilities(agentId),
  };
}

import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AgentId,
  type AgentPermissionModeOption,
  type AgentRuntimeAxisCapabilities,
  type AgentSessionMode,
  isAcpRegistryAgentId,
  PLAN_MODE_ID,
} from "./contracts";

export interface AcpAgentProfile {
  sessionModes?: AgentSessionMode[];
  permissionModes?: AgentPermissionModeOption[];
  runtimeAxes?: AgentRuntimeAxisCapabilities;
  supportsSteering?: boolean;
  documentAttachments?: boolean;
  lazyModelAxes?: boolean;
}

const inSession = "in-session" as const;

const acpAgentProfiles: Readonly<Record<string, AcpAgentProfile>> = {
  cursor: {
    runtimeAxes: { model: inSession, thinking: inSession },
  },
  devin: {
    runtimeAxes: { model: inSession, thinking: inSession, speed: inSession },
    lazyModelAxes: true,
  },
  "grok-build": {
    sessionModes: [
      { id: "default", name: "Default" },
      { id: PLAN_MODE_ID, name: "Plan" },
    ],
    permissionModes: [
      { id: "grok-ask", risk: "normal" },
      { id: "grok-auto", risk: "elevated" },
      { id: "grok-always-approve", risk: "dangerous" },
    ],
    runtimeAxes: {
      model: inSession,
      thinking: inSession,
      permission: inSession,
    },
    supportsSteering: true,
    documentAttachments: true,
  },
};

export function getAcpRegistryId(agentId: AgentId) {
  return isAcpRegistryAgentId(agentId)
    ? agentId.slice(ACP_REGISTRY_AGENT_ID_PREFIX.length)
    : null;
}

export function getAcpAgentProfile(agentId: AgentId): AcpAgentProfile {
  const registryId = getAcpRegistryId(agentId);
  return (registryId && acpAgentProfiles[registryId]) || {};
}

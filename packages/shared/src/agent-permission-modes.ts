import { getAcpAgentProfile } from "./acp-agent-profiles";
import { builtInAgentManifests } from "./built-in-agents";
import {
  type AgentId,
  type AgentPermissionMode,
  isAcpRegistryAgentId,
} from "./contracts";

export function isAgentPermissionModeSupportedForModel(
  agentId: AgentId,
  permissionMode: AgentPermissionMode,
  modelId?: string | null,
  modelName?: string | null,
) {
  if (isAcpRegistryAgentId(agentId)) return true;
  const supports = builtInAgentManifests[agentId]?.supportsPermissionMode;
  return supports
    ? supports(permissionMode, { id: modelId, name: modelName })
    : true;
}

export function getFallbackAgentPermissionModes(agentId: AgentId) {
  const modes = isAcpRegistryAgentId(agentId)
    ? (getAcpAgentProfile(agentId).permissionModes ?? [])
    : (builtInAgentManifests[agentId]?.permissionModes ?? []);
  return modes.map((mode) => ({ ...mode }));
}

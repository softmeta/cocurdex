import {
  type AgentId,
  CODEX_BUILT_IN_PROVIDER_ID,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";

export function shouldPersistProviderDefault(
  agentId: AgentId,
  providerId: string,
) {
  if (
    isAcpRegistryAgentId(agentId) ||
    agentId === "claude-agent" ||
    agentId === "opencode"
  ) {
    return false;
  }

  return providerId !== CODEX_BUILT_IN_PROVIDER_ID;
}

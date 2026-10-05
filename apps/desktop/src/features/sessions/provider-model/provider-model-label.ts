import { type AgentId, isAcpRegistryAgentId } from "@cocurdex/shared";

export function shouldShowProviderGroupLabels(agentId: AgentId) {
  return !isAcpRegistryAgentId(agentId) && agentId !== "claude-agent";
}

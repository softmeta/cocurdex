import { type AgentId, getAgentTraits } from "@cocurdex/shared";

export function shouldShowProviderGroupLabels(agentId: AgentId) {
  return getAgentTraits(agentId).modelCatalog !== "agent";
}

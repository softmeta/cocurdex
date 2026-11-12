import { type AgentId, getAgentTraits } from "@cocurdex/shared";

export function shouldPersistProviderDefault(agentId: AgentId) {
  return getAgentTraits(agentId).modelCatalog === "app-providers";
}

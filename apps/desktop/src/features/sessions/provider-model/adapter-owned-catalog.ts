import { type AgentId, getAcpAgentProfile } from "@cocurdex/shared";

export function usesAdapterOwnedModelCatalog(agentId: AgentId) {
  return agentId !== "pi";
}

export function usesLazyModelAxesProbe(agentId: AgentId) {
  return getAcpAgentProfile(agentId).lazyModelAxes === true;
}

import {
  type AgentId,
  getAcpAgentProfile,
  getAgentTraits,
} from "@cocurdex/shared";

export function usesAdapterOwnedModelCatalog(agentId: AgentId) {
  return getAgentTraits(agentId).modelCatalog !== "app-providers";
}

export function usesLazyModelAxesProbe(agentId: AgentId) {
  return getAcpAgentProfile(agentId).lazyModelAxes === true;
}

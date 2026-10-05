import { type AgentId, isAcpRegistryAgentId } from "@cocurdex/shared";
import { getAgentDisplayLabel } from "../session-store";

export function getAgentLoginLabel(agentId: AgentId | undefined) {
  return agentId && isAcpRegistryAgentId(agentId)
    ? getAgentDisplayLabel(agentId)
    : null;
}

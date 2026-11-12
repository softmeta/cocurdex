import { getAgentTraits } from "./agent-traits";
import type { AgentId, SessionTitleStrategy } from "./contracts";

export function getAgentSessionTitleStrategy(
  agentId: AgentId,
): SessionTitleStrategy {
  return getAgentTraits(agentId).sessionTitleStrategy;
}

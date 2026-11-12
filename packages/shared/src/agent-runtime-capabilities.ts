import { getAgentTraits } from "./agent-traits";
import type {
  AgentId,
  AgentRuntimeAxis,
  AgentRuntimeAxisCapabilities,
} from "./contracts";

export function getAgentRuntimeAxisCapabilities(
  agentId: AgentId,
): AgentRuntimeAxisCapabilities {
  return getAgentTraits(agentId).runtimeAxes;
}

export function supportsInSessionRuntimeAxis(
  agentId: AgentId,
  axis: AgentRuntimeAxis,
) {
  return getAgentRuntimeAxisCapabilities(agentId)[axis] === "in-session";
}

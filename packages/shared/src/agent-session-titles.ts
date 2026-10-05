import {
  type AgentId,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
  type SessionTitleStrategy,
} from "./contracts";

const agentSessionTitleStrategies = {
  "claude-agent": "adapter-generated",
  codex: "adapter-generated",
  opencode: "native",
  pi: "app-generated",
} as const satisfies Record<BuiltInAgentId, SessionTitleStrategy>;

export function getAgentSessionTitleStrategy(
  agentId: AgentId,
): SessionTitleStrategy {
  return isAcpRegistryAgentId(agentId)
    ? "native"
    : agentSessionTitleStrategies[agentId];
}

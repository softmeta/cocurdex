import type { AgentId, SessionTitleStrategy } from "./contracts";

const agentSessionTitleStrategies = {
  "claude-agent": "adapter-generated",
  codex: "adapter-generated",
  "grok-build": "native",
  opencode: "native",
  pi: "app-generated",
} as const satisfies Record<AgentId, SessionTitleStrategy>;

export function getAgentSessionTitleStrategy(
  agentId: AgentId,
): SessionTitleStrategy {
  return agentSessionTitleStrategies[agentId];
}

import type { AgentId } from "@cocurdex/shared";

export function shouldShowProviderGroupLabels(agentId: AgentId) {
  return agentId !== "claude-agent" && agentId !== "grok-build";
}

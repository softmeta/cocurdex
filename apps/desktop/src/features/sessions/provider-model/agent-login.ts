import type { AgentId } from "@cocurdex/shared";

// Agents whose CLI owns a browser login flow reachable through the daemon's
// `agent.login` RPC (ACP `authenticate`). Mirrors the cases in
// DaemonProviderService.loginAgent.
const LOGIN_AGENT_LABELS: Partial<Record<AgentId, string>> = {
  cursor: "Cursor",
  devin: "Devin",
};

export function getAgentLoginLabel(agentId: AgentId | undefined) {
  return agentId ? (LOGIN_AGENT_LABELS[agentId] ?? null) : null;
}

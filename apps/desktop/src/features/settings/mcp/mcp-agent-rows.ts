import {
  type AgentId,
  type AgentMcpUnsupportedReason,
  PI_MCP_AGENT_ID,
} from "@cocurdex/shared";

export type McpAgentAccessMode = "native" | "injected";

export type McpAgentAccess =
  | { kind: McpAgentAccessMode }
  | { kind: "serverUnsupported"; reason: AgentMcpUnsupportedReason };

export interface McpAgentRow {
  agentId: AgentId;
  checked: boolean;
  access: McpAgentAccess;
  toggleable: boolean;
}

function agentAccess(
  agentId: AgentId,
  unsupported: AgentMcpUnsupportedReason | null,
): McpAgentAccess {
  if (agentId === PI_MCP_AGENT_ID) return { kind: "native" };
  if (unsupported) return { kind: "serverUnsupported", reason: unsupported };
  return { kind: "injected" };
}

export function mcpAgentRows(
  availableAgents: readonly AgentId[],
  assigned: readonly AgentId[],
  unsupported: AgentMcpUnsupportedReason | null,
): McpAgentRow[] {
  const agentIds = [...new Set([...availableAgents, ...assigned])];
  return agentIds.map((agentId) => {
    const checked = assigned.includes(agentId);
    const access = agentAccess(agentId, unsupported);
    const canReceive = access.kind === "native" || access.kind === "injected";
    return { agentId, checked, access, toggleable: canReceive || checked };
  });
}

export function toggleMcpAgent(
  assigned: readonly AgentId[],
  agentId: AgentId,
  enabled: boolean,
): AgentId[] {
  const rest = assigned.filter((agent) => agent !== agentId);
  return enabled ? [...rest, agentId] : rest;
}

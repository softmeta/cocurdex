import type { SessionRecord } from "./contracts";

export const AGENT_TOOL_SERVER_NAME = "cocurdex";
export const AGENT_TOOL_HTTP_PATH = "/mcp";

export const agentToolGroupIds = [
  "messaging",
  "team",
  "script_run",
  "memory",
  "notes",
  "issues",
  "settings",
] as const;

export type AgentToolGroupId = (typeof agentToolGroupIds)[number];

export interface AgentToolDescriptor {
  group: AgentToolGroupId;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentToolCallerContext {
  sessionId: string;
  sessionKind: NonNullable<SessionRecord["sessionKind"]>;
  workspaceId: string;
  teamId: string | null;
}

export interface AgentToolCatalog {
  caller: AgentToolCallerContext;
  tools: AgentToolDescriptor[];
}

export interface AgentToolsBinding {
  token: string;
  url: string;
}

export function agentToolAuthorization(token: string) {
  return `Bearer ${token}`;
}

export function agentToolTokenFromAuthorization(
  header: string | string[] | undefined,
) {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)$/i.exec(value ?? "");
  return match ? match[1] : null;
}

export function agentToolFullName(descriptor: {
  group: AgentToolGroupId;
  name: string;
}) {
  return `${descriptor.group}_${descriptor.name}`;
}

// Providers render MCP permission titles differently: ACP agents produce
// "Calling <tool> from <server>", Claude-style agents use the raw tool name
// "mcp__<server>__<tool>". Returns the first-party tool name or null when the
// title is not recognizably a Cocurdex tool call — callers must then fall back
// to the normal approval flow.
export function agentToolNameFromPermissionTitle(title: string): string | null {
  const mcpMatch = new RegExp(`^mcp__${AGENT_TOOL_SERVER_NAME}__(\\S+)$`).exec(
    title,
  );
  if (mcpMatch) {
    return mcpMatch[1];
  }
  const callingMatch = /^Calling (\S+) from (\S+)$/.exec(title);
  if (callingMatch?.[2] === AGENT_TOOL_SERVER_NAME) {
    return callingMatch[1];
  }
  return null;
}

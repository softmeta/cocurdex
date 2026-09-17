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

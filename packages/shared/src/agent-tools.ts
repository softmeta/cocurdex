import type { SessionRecord } from "./contracts";

export const AGENT_TOOL_SERVER_NAME = "cocurdex";
export const AGENT_TOOL_TOKEN_ENV = "COCURDEX_AGENT_TOKEN";
export const AGENT_TOOL_USER_DATA_PATH_ENV = "COCURDEX_USER_DATA_PATH";

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

export interface AgentToolStdioServerSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentToolsBinding {
  token: string;
  stdio: AgentToolStdioServerSpec;
}

export function agentToolFullName(descriptor: {
  group: AgentToolGroupId;
  name: string;
}) {
  return `${descriptor.group}_${descriptor.name}`;
}

import {
  AGENT_TOOL_SERVER_NAME,
  type AgentMcpServer,
  type AgentToolsBinding,
} from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  acpAgentToolsMcpServers,
  codexAgentToolsThreadConfig,
} from "./agent-tools-mcp";

type StdioServer = Extract<AgentMcpServer, { transport: "stdio" }>;
type HttpServer = Extract<AgentMcpServer, { transport: "http" }>;

function userServers(servers: readonly AgentMcpServer[] | undefined) {
  return (servers ?? []).filter(
    (server) => server.name !== AGENT_TOOL_SERVER_NAME,
  );
}

function pairs(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

export type ClaudeInjectedMcpServer =
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  | { type: "http"; url: string; headers: Record<string, string> };

export function claudeInjectedMcpServers(
  servers: readonly AgentMcpServer[] | undefined,
): Record<string, ClaudeInjectedMcpServer> {
  return Object.fromEntries(
    userServers(servers).map((server) => [
      server.name,
      server.transport === "stdio"
        ? {
            type: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
          }
        : { type: "http", url: server.url, headers: server.headers },
    ]),
  );
}

export function codexInjectedMcpServers(
  servers: readonly AgentMcpServer[] | undefined,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    userServers(servers).map((server) => [
      server.name,
      server.transport === "stdio"
        ? { command: server.command, args: server.args, env: server.env }
        : { url: server.url, http_headers: server.headers },
    ]),
  );
}

export type AcpInjectedMcpServer =
  | {
      name: string;
      command: string;
      args: string[];
      env: Array<{ name: string; value: string }>;
    }
  | {
      type: "http";
      name: string;
      url: string;
      headers: Array<{ name: string; value: string }>;
    };

function acpStdio(server: StdioServer): AcpInjectedMcpServer {
  return {
    name: server.name,
    command: server.command,
    args: server.args,
    env: pairs(server.env),
  };
}

function acpHttp(server: HttpServer): AcpInjectedMcpServer {
  return {
    type: "http",
    name: server.name,
    url: server.url,
    headers: pairs(server.headers),
  };
}

export function acpInjectedMcpServers(
  servers: readonly AgentMcpServer[] | undefined,
  mcpCapabilities: { http?: boolean } | null | undefined,
): AcpInjectedMcpServer[] {
  const supportsHttp = mcpCapabilities?.http === true;
  return userServers(servers).flatMap((server) => {
    if (server.transport === "stdio") return [acpStdio(server)];
    return supportsHttp ? [acpHttp(server)] : [];
  });
}

export async function loadInjectedMcpServers(
  resolve: (() => Promise<AgentMcpServer[]>) | undefined,
): Promise<AgentMcpServer[]> {
  if (!resolve) return [];
  try {
    return await resolve();
  } catch (error) {
    logAdapterDiagnostic("info", "[InjectedMcp] resolve failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function codexThreadMcpConfig(
  binding: AgentToolsBinding | null | undefined,
  servers: readonly AgentMcpServer[],
): { config?: Record<string, unknown> } {
  const agentToolServers =
    codexAgentToolsThreadConfig(binding).config?.mcp_servers;
  const mcpServers = {
    ...codexInjectedMcpServers(servers),
    ...(agentToolServers as Record<string, unknown> | undefined),
  };
  return Object.keys(mcpServers).length > 0
    ? { config: { mcp_servers: mcpServers } }
    : {};
}

export async function acpSessionMcpServers(
  payload: {
    agentTools?: AgentToolsBinding | null;
    resolveMcpServers?(): Promise<AgentMcpServer[]>;
  },
  mcpCapabilities: { http?: boolean } | null | undefined,
): Promise<AcpInjectedMcpServer[]> {
  const injected = await loadInjectedMcpServers(payload.resolveMcpServers);
  return [
    ...acpInjectedMcpServers(injected, mcpCapabilities),
    ...acpAgentToolsMcpServers(payload.agentTools, mcpCapabilities),
  ];
}

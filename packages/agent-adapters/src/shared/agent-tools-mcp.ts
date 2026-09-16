import {
  AGENT_TOOL_SERVER_NAME,
  type AgentToolsBinding,
  agentToolAuthorization,
} from "@cocurdex/shared";

export interface ClaudeHttpMcpServerConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
}

export function claudeAgentToolsMcpServers(
  binding: AgentToolsBinding | null | undefined,
): Record<string, ClaudeHttpMcpServerConfig> {
  if (!binding) return {};
  return {
    [AGENT_TOOL_SERVER_NAME]: {
      type: "http",
      url: binding.url,
      headers: { Authorization: agentToolAuthorization(binding.token) },
    },
  };
}

export interface AcpHttpMcpServer {
  type: "http";
  name: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export function acpAgentToolsMcpServers(
  binding: AgentToolsBinding | null | undefined,
  mcpCapabilities: { http?: boolean } | null | undefined,
): AcpHttpMcpServer[] {
  if (!binding || mcpCapabilities?.http !== true) return [];
  return [
    {
      type: "http",
      name: AGENT_TOOL_SERVER_NAME,
      url: binding.url,
      headers: [
        { name: "Authorization", value: agentToolAuthorization(binding.token) },
      ],
    },
  ];
}

export function codexAgentToolsThreadConfig(
  binding: AgentToolsBinding | null | undefined,
): { config?: Record<string, unknown> } {
  if (!binding) return {};
  return {
    config: {
      mcp_servers: {
        [AGENT_TOOL_SERVER_NAME]: {
          url: binding.url,
          http_headers: {
            Authorization: agentToolAuthorization(binding.token),
          },
        },
      },
    },
  };
}

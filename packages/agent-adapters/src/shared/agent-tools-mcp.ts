import {
  AGENT_TOOL_SERVER_NAME,
  type AgentToolsBinding,
} from "@cocurdex/shared";

export interface StdioMcpServerConfig {
  type: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function claudeAgentToolsMcpServers(
  binding: AgentToolsBinding | null | undefined,
): Record<string, StdioMcpServerConfig> {
  if (!binding) return {};
  return {
    [AGENT_TOOL_SERVER_NAME]: { type: "stdio", ...binding.stdio },
  };
}

export interface AcpStdioMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export function acpAgentToolsMcpServers(
  binding: AgentToolsBinding | null | undefined,
): AcpStdioMcpServer[] {
  if (!binding) return [];
  return [
    {
      name: AGENT_TOOL_SERVER_NAME,
      command: binding.stdio.command,
      args: binding.stdio.args,
      env: Object.entries(binding.stdio.env).map(([name, value]) => ({
        name,
        value,
      })),
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
          command: binding.stdio.command,
          args: binding.stdio.args,
          env: binding.stdio.env,
        },
      },
    },
  };
}

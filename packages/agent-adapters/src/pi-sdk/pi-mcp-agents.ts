import { mcpServerAgents, PI_MCP_AGENT_ID } from "@cocurdex/shared";
import type { LoadedMcpConfig } from "@earendil-works/pi-coding-agent/mcp-config";

export function onlyPiMcpServers(loaded: LoadedMcpConfig): LoadedMcpConfig {
  return {
    ...loaded,
    servers: loaded.servers.filter(
      (entry) =>
        entry.scope === "project" ||
        mcpServerAgents(
          entry.config as unknown as Record<string, unknown>,
        ).includes(PI_MCP_AGENT_ID),
    ),
  };
}

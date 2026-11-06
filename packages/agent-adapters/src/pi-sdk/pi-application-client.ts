import type { ApplicationTool, McpServerConfig } from "@cocurdex/shared";
import { McpOAuthCredentialStore } from "@earendil-works/pi-coding-agent/mcp-runtime";
import { applicationToolResult } from "./application-result";
import { createConnection, findEntry, type PiMcpLocation } from "./pi-mcp";

export function createPiApplicationClient(
  location: PiMcpLocation,
  name: string,
  expectedConfig?: McpServerConfig,
) {
  const { agentDir, entry } = findEntry(location, name, expectedConfig);
  const connection = createConnection(
    entry,
    location.cwd,
    agentDir,
    new McpOAuthCredentialStore(),
  );
  return {
    async tools(): Promise<ApplicationTool[]> {
      await connection.getClient();
      return connection.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema,
        readOnly: tool.annotations?.readOnlyHint === true,
      }));
    },
    async call(name: string, args: Record<string, unknown>): Promise<unknown> {
      return applicationToolResult(await connection.callTool(name, args, {}));
    },
    close: () => connection.close(),
  };
}

import { loadMcpConfig } from "@earendil-works/pi-coding-agent/mcp-config";
import {
  createDefaultTransport,
  McpOAuthCredentialStore,
  McpServerConnection,
} from "@earendil-works/pi-coding-agent/mcp-runtime";
import {
  defineExtension,
  defineTool,
  type Extension,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import {
  createMcpToolName,
  limitMcpContent,
  normalizeMcpInputSchema,
  toLlmContent,
} from "@earendil-works/pi-mcp";
import { logAdapterDiagnostic } from "../diagnostics";
import { onlyPiMcpServers } from "../pi-sdk/pi-mcp-agents";

type McpEntry = ReturnType<typeof loadMcpConfig>["servers"][number];

function connectionKey(entry: McpEntry) {
  return `${entry.source}\u0000${entry.name}`;
}

function extensionName(entry: McpEntry) {
  return `mcp:${entry.name}`;
}

/**
 * MCP servers configured for pi, bridged into durable tools. Each server is one extension whose
 * tools are deferred: the model finds them with `tool_search` and code mode scripts call them.
 * Calls are not replay-safe, since a server tool may change the outside world.
 */
export class DurableMcpServers {
  private readonly connections = new Map<string, McpServerConnection>();
  private credentials: McpOAuthCredentialStore | null = null;

  constructor(
    private readonly agentDir: string,
    private readonly install: (extension: Extension) => void,
  ) {}

  /** Connects the servers configured for `cwd`; returns their extensions' names. */
  ensure(cwd: string): string[] {
    const loaded = onlyPiMcpServers(
      loadMcpConfig({ agentDir: this.agentDir, cwd, projectTrusted: true }),
    );
    const names: string[] = [];
    for (const entry of loaded.servers) {
      if (entry.config.enabled === false) continue;
      names.push(extensionName(entry));
      const key = connectionKey(entry);
      if (this.connections.has(key)) continue;
      this.install(defineExtension({ name: extensionName(entry), tools: [] }));
      this.connections.set(key, this.connect(entry, cwd));
    }
    return names;
  }

  async close() {
    const connections = [...this.connections.values()];
    this.connections.clear();
    await Promise.allSettled(connections.map((entry) => entry.close()));
  }

  private connect(entry: McpEntry, cwd: string) {
    this.credentials ??= new McpOAuthCredentialStore();
    return new McpServerConnection({
      entry,
      cwd,
      createTransport: createDefaultTransport,
      credentials: this.credentials,
      onTools: (connection) => this.install(this.extension(connection)),
      onChange: (connection) => {
        if (connection.error) {
          logAdapterDiagnostic("info", "pi-durable: mcp server changed", {
            server: connection.name,
            state: connection.state,
            error: connection.error,
          });
        }
      },
    });
  }

  private extension(connection: McpServerConnection): Extension {
    const taken = new Set<string>();
    const tools = connection.tools.map((tool) => {
      const name = createMcpToolName(connection.name, tool.name, (candidate) =>
        taken.has(candidate),
      );
      taken.add(name);
      return defineTool({
        name,
        description: tool.description ?? tool.name,
        parameters: normalizeMcpInputSchema(tool.inputSchema),
        deferred: true,
        execute: async (args, _api, context) => {
          const result = await connection.callTool(
            tool.name,
            (args ?? {}) as Record<string, unknown>,
            { signal: context.abortSignal, timeoutMs: connection.timeoutMs },
          );
          const { content } = await limitMcpContent(toLlmContent(result));
          return { output: content, isError: result.isError === true };
        },
      }) as ToolRegistration;
    });
    return defineExtension({ name: extensionName(connection.entry), tools });
  }
}

import type { AgentMcpServerRuntime } from "@cocurdex/shared";

// Official Grok ACP extension. The TUI `/mcps` modal uses the same request
// (`x.ai/mcp/list`) and annotates each catalog row with the session handshake.
export const GROK_MCP_LIST_METHOD = "x.ai/mcp/list";

// Grok pushes these as servers finish handshaking, die, or get reconfigured
// (see xai-grok-shell `session/mcp_dispatcher.rs`; `server_status` can be
// turned off with `GROK_MCP_PUSH_SERVER_STATUS=0`). The TUI treats them as a
// trigger to refetch `x.ai/mcp/list`, and so do we.
export const GROK_MCP_CHANGE_NOTIFICATION_METHODS = [
  "x.ai/mcp/server_status",
  "x.ai/mcp/servers_updated",
  "x.ai/mcp/tools_changed",
];

export function buildGrokMcpListParams(providerSessionId: string) {
  return { cache: true, sessionId: providerSessionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSessionStatus(session: Record<string, unknown>): string {
  if (session.enabled === false) {
    return "disabled";
  }
  if (session.authRequired === true) {
    return "failed";
  }

  const status =
    typeof session.status === "string" ? session.status.toLowerCase() : "";
  if (status === "ready") {
    return "connected";
  }
  if (status === "initializing") {
    return "connecting";
  }
  if (status === "unavailable") {
    return "failed";
  }
  return status.length > 0 ? status : "unknown";
}

/**
 * Read the MCP catalog out of an `x.ai/mcp/list` response.
 *
 * The payload is Grok's `ExtMethodResult`: `{ result: { servers: [...] } }`.
 * A missing or malformed `servers` field means "keep what we already have".
 */
export function parseGrokBuildMcpServers(
  value: unknown,
): AgentMcpServerRuntime[] | null {
  if (!isRecord(value)) {
    return null;
  }
  const response = isRecord(value.result) ? value.result : value;
  if (!Array.isArray(response.servers)) {
    return null;
  }

  const servers: AgentMcpServerRuntime[] = [];
  for (const entry of response.servers) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name) {
      continue;
    }
    const session = isRecord(entry.session) ? entry.session : null;
    servers.push({
      name: entry.name,
      status: session ? readSessionStatus(session) : "unknown",
    });
  }
  return servers;
}

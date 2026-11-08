import type { AgentMcpServerRuntime } from "@cocurdex/shared";
import { isRecord } from "./codex-app-server-events";

export const CODEX_MCP_STARTUP_STATUS_METHOD =
  "mcpServer/startupStatus/updated";

export function parseCodexMcpServerStatus(
  params: unknown,
): AgentMcpServerRuntime | null {
  if (!isRecord(params)) {
    return null;
  }

  const { name, status } = params;

  if (typeof name !== "string" || typeof status !== "string") {
    return null;
  }

  return { name, status };
}

export function mergeCodexMcpServers(
  current: readonly AgentMcpServerRuntime[],
  next: AgentMcpServerRuntime,
): AgentMcpServerRuntime[] {
  const index = current.findIndex((server) => server.name === next.name);

  if (index === -1) {
    return [...current, next];
  }

  if (current[index]?.status === next.status) {
    return [...current];
  }

  return current.map((server, at) => (at === index ? next : server));
}

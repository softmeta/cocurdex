import type {
  McpServerConfig,
  McpServerScope,
  McpServerStatus,
} from "@cocurdex/shared";
import type { McpDotState } from "./mcp-status-dot";

export type McpSelection =
  | { scope: McpServerScope; name: string }
  | { scope: "new" };

export function serverSummary(config: McpServerConfig) {
  if (typeof config.url === "string") return config.url;
  const command = typeof config.command === "string" ? config.command : "";
  const args = Array.isArray(config.args)
    ? config.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return [command, ...args].join(" ");
}

export function serverDotState(
  config: McpServerConfig,
  status: McpServerStatus | undefined,
): McpDotState {
  if (config.enabled === false) return "disabled";
  return status?.state ?? "unknown";
}

export function matchesServerQuery(
  name: string,
  config: McpServerConfig,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    name.toLowerCase().includes(needle) ||
    serverSummary(config).toLowerCase().includes(needle)
  );
}

export function resolveSelection(
  selection: McpSelection | null,
  globalNames: string[],
  projectNames: string[],
): McpSelection | null {
  if (selection?.scope === "new") return selection;
  if (selection?.scope === "global" && globalNames.includes(selection.name)) {
    return selection;
  }
  if (selection?.scope === "project" && projectNames.includes(selection.name)) {
    return selection;
  }
  if (globalNames[0] !== undefined) {
    return { scope: "global", name: globalNames[0] };
  }
  if (projectNames[0] !== undefined) {
    return { scope: "project", name: projectNames[0] };
  }
  return null;
}

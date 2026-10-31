export type McpServerConfig = Record<string, unknown>;

export type McpServerState = "connected" | "needs-auth" | "failed" | "disabled";

export type McpServerScope = "global" | "project";

export interface McpServerTool {
  name: string;
  description: string | null;
}

export interface McpServerStatus {
  name: string;
  scope: McpServerScope;
  state: McpServerState;
  tools: McpServerTool[];
  error: string | null;
  oauth: boolean;
  signedIn: boolean;
  checkedAt: string;
}

export interface McpStatusReport {
  servers: McpServerStatus[];
  errors: string[];
}

export interface McpProjectConfigFile {
  path: string;
  content: string | null;
}

export interface McpLoginStartResult {
  loginId: string | null;
  authUrl: string | null;
}

export interface McpLoginOutcome {
  success: boolean;
  error: string | null;
}

export const MCP_IMPORT_SOURCES = [
  "claude",
  "claude-project",
  "codex",
  "codex-project",
  "cursor",
  "opencode",
  "opencode-project",
  "antigravity",
] as const;

export type McpImportSource = (typeof MCP_IMPORT_SOURCES)[number];

export type McpImportMatch = "new" | "same" | "different";

export interface McpImportCandidate {
  source: McpImportSource;
  sourcePath: string;
  name: string;
  config: McpServerConfig;
  match: McpImportMatch;
  disabledInSource: boolean;
  unsupported: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJson(value[key])]),
  );
}

export function sameMcpServerConfig(
  left: McpServerConfig,
  right: McpServerConfig,
) {
  const strip = ({
    enabled: _enabled,
    cocurdex: _cocurdex,
    ...rest
  }: McpServerConfig) => rest;
  return (
    JSON.stringify(sortedJson(strip(left))) ===
    JSON.stringify(sortedJson(strip(right)))
  );
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const trimmed = content.trim().replace(/,$/, "");
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(`{${trimmed}}`);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

function serverMap(parsed: Record<string, unknown>) {
  if (isRecord(parsed.mcpServers)) return parsed.mcpServers;
  if (isRecord(parsed.servers)) return parsed.servers;
  return parsed;
}

export function parseMcpServersJson(
  content: string,
): Record<string, McpServerConfig> {
  const parsed = parseJsonObject(content);
  if (!isRecord(parsed)) {
    throw new Error("Expected a JSON object");
  }
  const servers = serverMap(parsed);
  const entries = Object.entries(servers);
  if (entries.length === 0) {
    throw new Error("No MCP servers found");
  }
  const result: Record<string, McpServerConfig> = {};
  for (const [name, config] of entries) {
    if (!isRecord(config)) {
      throw new Error(`Server "${name}" must be an object`);
    }
    result[name] = normalizeImportedMcpServer(config);
  }
  return result;
}

export function normalizeImportedMcpServer(
  config: Record<string, unknown>,
): McpServerConfig {
  const { serverUrl, disabled, ...rest } = config;
  const normalized: McpServerConfig = { ...rest };
  if (typeof serverUrl === "string" && typeof rest.url !== "string") {
    normalized.url = serverUrl;
  }
  if (disabled === true) {
    normalized.enabled = false;
  }
  return normalized;
}

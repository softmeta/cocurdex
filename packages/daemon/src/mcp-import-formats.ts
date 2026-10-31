import {
  type McpServerConfig,
  normalizeImportedMcpServer,
} from "@cocurdex/shared";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

export type McpImportFormat = "mcp-json" | "codex-toml" | "opencode-jsonc";

export interface ImportedMcpServer {
  name: string;
  config: McpServerConfig;
  disabledInSource: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function envReference(name: string) {
  return `\${${name}}`;
}

function withNonEmpty(
  config: McpServerConfig,
  key: string,
  value: Record<string, string> | string[],
): McpServerConfig {
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  return size > 0 ? { ...config, [key]: value } : config;
}

function readMcpJson(content: string): ImportedMcpServer[] {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return [];
  return Object.entries(parsed.mcpServers).flatMap(([name, raw]) => {
    if (!isRecord(raw)) return [];
    return [
      {
        name,
        config: normalizeImportedMcpServer(raw),
        disabledInSource: raw.disabled === true || raw.enabled === false,
      },
    ];
  });
}

function codexEnvVarName(entry: unknown) {
  if (typeof entry === "string") return entry;
  if (isRecord(entry) && typeof entry.name === "string") return entry.name;
  return null;
}

function codexEnv(raw: Record<string, unknown>) {
  const passthrough = Array.isArray(raw.env_vars)
    ? raw.env_vars.flatMap((entry) => {
        const name = codexEnvVarName(entry);
        return name ? [[name, envReference(name)] as const] : [];
      })
    : [];
  return { ...Object.fromEntries(passthrough), ...stringRecord(raw.env) };
}

function codexHeaders(raw: Record<string, unknown>) {
  const fromEnv = Object.entries(stringRecord(raw.env_http_headers)).map(
    ([header, variable]) => [header, envReference(variable)] as const,
  );
  const bearer: Record<string, string> =
    typeof raw.bearer_token_env_var === "string"
      ? { Authorization: `Bearer ${envReference(raw.bearer_token_env_var)}` }
      : {};
  return {
    ...stringRecord(raw.http_headers),
    ...Object.fromEntries(fromEnv),
    ...bearer,
  };
}

export function codexMcpServerConfig(
  raw: Record<string, unknown>,
): McpServerConfig {
  let config: McpServerConfig = {};
  if (typeof raw.command === "string") {
    config = { command: raw.command };
    config = withNonEmpty(config, "args", stringList(raw.args));
    config = withNonEmpty(config, "env", codexEnv(raw));
    if (typeof raw.cwd === "string") config = { ...config, cwd: raw.cwd };
  } else if (typeof raw.url === "string") {
    config = withNonEmpty({ url: raw.url }, "headers", codexHeaders(raw));
  }
  return raw.enabled === false ? { ...config, enabled: false } : config;
}

function readCodexToml(content: string): ImportedMcpServer[] {
  const parsed = parseToml(content);
  if (!isRecord(parsed.mcp_servers)) return [];
  return Object.entries(parsed.mcp_servers).flatMap(([name, raw]) => {
    if (!isRecord(raw)) return [];
    return [
      {
        name,
        config: codexMcpServerConfig(raw),
        disabledInSource: raw.enabled === false,
      },
    ];
  });
}

const OPENCODE_ENV_TEMPLATE = /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

function openCodeValue(value: string) {
  return value.replace(OPENCODE_ENV_TEMPLATE, (_match, name: string) =>
    envReference(name),
  );
}

function openCodeRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(stringRecord(value)).map(([key, item]) => [
      key,
      openCodeValue(item),
    ]),
  );
}

function openCodeDisabled(raw: Record<string, unknown>) {
  return raw.enabled === false || raw.disabled === true;
}

export function openCodeMcpServerConfig(
  raw: Record<string, unknown>,
): McpServerConfig {
  let config: McpServerConfig = {};
  if (raw.type === "local") {
    const [command = "", ...args] = stringList(raw.command).map(openCodeValue);
    config = withNonEmpty({ command }, "args", args);
    config = withNonEmpty(config, "env", openCodeRecord(raw.environment));
    if (typeof raw.cwd === "string") config = { ...config, cwd: raw.cwd };
  } else if (raw.type === "remote" && typeof raw.url === "string") {
    config = withNonEmpty(
      { url: openCodeValue(raw.url) },
      "headers",
      openCodeRecord(raw.headers),
    );
  }
  return openCodeDisabled(raw) ? { ...config, enabled: false } : config;
}

function isOpenCodeServer(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (value.type === "local" || value.type === "remote");
}

function openCodeServerEntries(mcp: Record<string, unknown>) {
  const direct = Object.entries(mcp).filter(([, value]) =>
    isOpenCodeServer(value),
  );
  const nested = isRecord(mcp.servers)
    ? Object.entries(mcp.servers).filter(([, value]) => isOpenCodeServer(value))
    : [];
  return [...direct, ...nested] as [string, Record<string, unknown>][];
}

function readOpenCodeJsonc(content: string): ImportedMcpServer[] {
  const parsed: unknown = parseJsonc(content, [], {
    allowTrailingComma: true,
  });
  if (!isRecord(parsed) || !isRecord(parsed.mcp)) return [];
  return openCodeServerEntries(parsed.mcp).map(([name, raw]) => ({
    name,
    config: openCodeMcpServerConfig(raw),
    disabledInSource: openCodeDisabled(raw),
  }));
}

const READERS: Record<
  McpImportFormat,
  (content: string) => ImportedMcpServer[]
> = {
  "mcp-json": readMcpJson,
  "codex-toml": readCodexToml,
  "opencode-jsonc": readOpenCodeJsonc,
};

export function readImportedMcpServers(
  format: McpImportFormat,
  content: string,
): ImportedMcpServer[] {
  try {
    return READERS[format](content);
  } catch {
    return [];
  }
}

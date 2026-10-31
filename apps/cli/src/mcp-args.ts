import {
  type AgentId,
  isAgentId,
  type McpServerConfig,
  withMcpServerAgents,
} from "@cocurdex/shared";

type OptionKind = "flag" | "value" | "list";

export interface McpArgs {
  positional: string[];
  values: Map<string, string | true>;
  lists: Map<string, string[]>;
}

export function parseMcpArgs(
  args: string[],
  known: Record<string, OptionKind>,
): McpArgs {
  const positional: string[] = [];
  const values = new Map<string, string | true>();
  const lists = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const kind = known[name];
    if (!kind) throw new Error(`Unknown option ${arg}`);
    if (kind === "flag") {
      values.set(name, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    index += 1;
    if (kind === "list") lists.set(name, [...(lists.get(name) ?? []), value]);
    else values.set(name, value);
  }
  return { positional, values, lists };
}

export function stringValue(args: McpArgs, name: string) {
  const value = args.values.get(name);
  return typeof value === "string" ? value : undefined;
}

function parsePairs(option: string, pairs: string[] | undefined) {
  const record: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      throw new Error(`--${option} expects KEY=VALUE, got "${pair}"`);
    }
    record[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return record;
}

export const MCP_ADD_OPTIONS: Record<string, OptionKind> = {
  url: "value",
  env: "list",
  cwd: "value",
  header: "list",
  "bearer-token-env-var": "value",
  description: "value",
  disabled: "flag",
  agent: "list",
  json: "flag",
};

export function parseAgentIds(values: readonly string[]): AgentId[] {
  return values.map((value) => {
    if (!isAgentId(value)) {
      throw new Error(
        `Unknown agent "${value}"; use pi, claude-agent, codex, opencode, or acp:<id>`,
      );
    }
    return value;
  });
}

export function buildMcpServerConfig(args: McpArgs): {
  name: string;
  config: McpServerConfig;
} {
  const [name, ...command] = args.positional;
  const url = stringValue(args, "url");
  if (!name || (url === undefined) === (command.length === 0)) {
    throw new Error(
      "Usage: cocurdex mcp add <name> (--url <url> | -- <command> [args...])",
    );
  }
  const httpOnly = ["header", "bearer-token-env-var"];
  const stdioOnly = ["env", "cwd"];
  const misplaced = (url === undefined ? httpOnly : stdioOnly).find(
    (option) => args.values.has(option) || args.lists.has(option),
  );
  if (misplaced) {
    throw new Error(
      `--${misplaced} only applies to ${url === undefined ? "remote servers (--url)" : "local command servers"}`,
    );
  }

  const config: McpServerConfig = {};
  if (url !== undefined) {
    config.url = url;
    const headers = parsePairs("header", args.lists.get("header"));
    const bearer = stringValue(args, "bearer-token-env-var");
    if (bearer !== undefined) headers.Authorization = `Bearer \${${bearer}}`;
    if (Object.keys(headers).length > 0) config.headers = headers;
  } else {
    const [executable, ...commandArgs] = command;
    config.command = executable;
    if (commandArgs.length > 0) config.args = commandArgs;
    const env = parsePairs("env", args.lists.get("env"));
    if (Object.keys(env).length > 0) config.env = env;
    const cwd = stringValue(args, "cwd");
    if (cwd !== undefined) config.cwd = cwd;
  }
  const description = stringValue(args, "description");
  if (description !== undefined) config.description = description;
  if (args.values.has("disabled")) config.enabled = false;
  const agents = args.lists.get("agent");
  return {
    name,
    config: agents
      ? withMcpServerAgents(config, parseAgentIds(agents))
      : config,
  };
}

const SECRET_REFERENCE =
  /^(\$\{[A-Za-z_][A-Za-z0-9_]*\}|Bearer \$\{[A-Za-z_][A-Za-z0-9_]*\}|!.*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" && !SECRET_REFERENCE.test(item)
        ? "<redacted>"
        : item,
    ]),
  );
}

export function redactMcpServer(config: McpServerConfig): McpServerConfig {
  const redacted: McpServerConfig = { ...config };
  if (isRecord(config.headers)) redacted.headers = redactRecord(config.headers);
  if (isRecord(config.env)) redacted.env = redactRecord(config.env);
  if (isRecord(config.oauth) && config.oauth.clientSecret !== undefined) {
    redacted.oauth = {
      ...config.oauth,
      ...redactRecord({ clientSecret: config.oauth.clientSecret }),
    };
  }
  return redacted;
}

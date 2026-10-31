import type { AgentId } from "./contracts";
import type { McpServerConfig } from "./mcp";

export const PI_MCP_AGENT_ID: AgentId = "pi";

export type AgentMcpServer =
  | {
      transport: "stdio";
      name: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  | {
      transport: "http";
      name: string;
      url: string;
      headers: Record<string, string>;
    };

export type AgentMcpUnsupportedReason =
  | "invalid"
  | "command-value"
  | "provider-auth"
  | "cwd"
  | "missing-env";

export type AgentMcpConversion =
  | { server: AgentMcpServer }
  | { unsupported: AgentMcpUnsupportedReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mcpServerAgents(config: McpServerConfig): AgentId[] {
  const extension = config.cocurdex;
  if (!isRecord(extension) || !Array.isArray(extension.agents)) {
    return [PI_MCP_AGENT_ID];
  }
  return extension.agents.filter(
    (agent): agent is AgentId => typeof agent === "string" && agent.length > 0,
  );
}

export function withMcpServerAgents(
  config: McpServerConfig,
  agents: readonly AgentId[],
): McpServerConfig {
  const extension = isRecord(config.cocurdex) ? config.cocurdex : {};
  return {
    ...config,
    cocurdex: { ...extension, agents: [...new Set(agents)] },
  };
}

export function mcpServerTargetsAgent(
  config: McpServerConfig,
  agentId: AgentId,
) {
  return config.enabled !== false && mcpServerAgents(config).includes(agentId);
}

const ENV_REFERENCE =
  /\$\$|\$!|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

class MissingEnvError extends Error {}

function expandValue(value: string, env: Record<string, string | undefined>) {
  return value.replace(ENV_REFERENCE, (match, braced, bare) => {
    if (match === "$$") return "$";
    if (match === "$!") return "!";
    const resolved = env[braced ?? bare];
    if (resolved === undefined) {
      throw new MissingEnvError(braced ?? bare);
    }
    return resolved;
  });
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function expandRecord(
  values: Record<string, string>,
  env: Record<string, string | undefined>,
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      expandValue(value, env),
    ]),
  );
}

function hasCommandValue(values: Record<string, string>) {
  return Object.values(values).some((value) => value.startsWith("!"));
}

function convert(
  name: string,
  config: McpServerConfig,
  env: Record<string, string | undefined>,
): AgentMcpConversion {
  if (typeof config.command === "string" && config.command) {
    const args = config.args ?? [];
    const values = stringRecord(config.env);
    if (
      !Array.isArray(args) ||
      args.some((arg) => typeof arg !== "string") ||
      !values
    ) {
      return { unsupported: "invalid" };
    }
    if (config.cwd !== undefined) return { unsupported: "cwd" };
    if (hasCommandValue(values)) return { unsupported: "command-value" };
    return {
      server: {
        transport: "stdio",
        name,
        command: config.command,
        args: args as string[],
        env: expandRecord(values, env),
      },
    };
  }
  if (typeof config.url === "string" && config.url) {
    const headers = stringRecord(config.headers);
    if (!headers) return { unsupported: "invalid" };
    if (config.auth !== undefined) return { unsupported: "provider-auth" };
    if (hasCommandValue(headers)) return { unsupported: "command-value" };
    return {
      server: {
        transport: "http",
        name,
        url: config.url,
        headers: expandRecord(headers, env),
      },
    };
  }
  return { unsupported: "invalid" };
}

export function toAgentMcpServer(
  name: string,
  config: McpServerConfig,
  env: Record<string, string | undefined>,
): AgentMcpConversion {
  try {
    return convert(name, config, env);
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return { unsupported: "missing-env" };
    }
    throw error;
  }
}

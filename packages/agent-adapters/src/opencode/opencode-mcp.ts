import {
  AGENT_TOOL_SERVER_NAME,
  type AgentMcpServer,
  type AgentToolsBinding,
  agentToolAuthorization,
} from "@cocurdex/shared";
import type { OpenCodeClient } from "./opencode-runtime";

export const OPENCODE_SHARED_MCP_PREFIX = "cocurdex-mcp-";
export const OPENCODE_SESSION_MCP_PREFIX = "cocurdex-session-";

export type OpenCodeMcpConfig =
  | {
      type: "local";
      command: string[];
      environment?: Record<string, string>;
    }
  | {
      type: "remote";
      url: string;
      headers?: Record<string, string>;
      oauth?: false;
    };

export interface OpenCodePermissionRule {
  action: string;
  resource: string;
  effect: "allow" | "deny" | "ask";
}

function toolNamespace(server: string) {
  return server.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function nonEmpty(record: Record<string, string>) {
  return Object.keys(record).length > 0 ? record : undefined;
}

export function openCodeSharedServerName(name: string) {
  return `${OPENCODE_SHARED_MCP_PREFIX}${name}`;
}

export function openCodeSessionServerName(sessionId: string) {
  return `${OPENCODE_SESSION_MCP_PREFIX}${toolNamespace(sessionId)}`;
}

export function openCodeMcpConfig(server: AgentMcpServer): OpenCodeMcpConfig {
  if (server.transport === "stdio") {
    const environment = nonEmpty(server.env);
    return {
      type: "local",
      command: [server.command, ...server.args],
      ...(environment ? { environment } : {}),
    };
  }
  const headers = nonEmpty(server.headers);
  return { type: "remote", url: server.url, ...(headers ? { headers } : {}) };
}

export function openCodeAgentToolsConfig(
  binding: AgentToolsBinding,
): OpenCodeMcpConfig {
  return {
    type: "remote",
    url: binding.url,
    headers: { Authorization: agentToolAuthorization(binding.token) },
    oauth: false,
  };
}

export function openCodeSharedMcpConfigs(
  servers: readonly AgentMcpServer[],
): Map<string, OpenCodeMcpConfig> {
  return new Map(
    servers
      .filter((server) => server.name !== AGENT_TOOL_SERVER_NAME)
      .map((server) => [
        openCodeSharedServerName(server.name),
        openCodeMcpConfig(server),
      ]),
  );
}

export function staleOpenCodeSharedServers(
  listed: readonly string[],
  desired: ReadonlySet<string>,
) {
  return listed.filter(
    (name) => name.startsWith(OPENCODE_SHARED_MCP_PREFIX) && !desired.has(name),
  );
}

export function isOpenCodeSessionToolRule(rule: OpenCodePermissionRule) {
  return rule.action.startsWith(OPENCODE_SESSION_MCP_PREFIX);
}

export function openCodeSessionToolRules(
  sessionServerName: string | null,
): OpenCodePermissionRule[] {
  const hideOthers: OpenCodePermissionRule = {
    action: `${OPENCODE_SESSION_MCP_PREFIX}*`,
    resource: "*",
    effect: "deny",
  };
  if (!sessionServerName) return [hideOthers];
  return [
    hideOthers,
    {
      action: `${toolNamespace(sessionServerName)}_*`,
      resource: "*",
      effect: "allow",
    },
  ];
}

export function withOpenCodeSessionToolRules(
  current: readonly OpenCodePermissionRule[],
  sessionServerName: string | null,
): OpenCodePermissionRule[] {
  return [
    ...current.filter((rule) => !isOpenCodeSessionToolRule(rule)),
    ...openCodeSessionToolRules(sessionServerName),
  ];
}

function configKey(config: OpenCodeMcpConfig) {
  return JSON.stringify(config);
}

const addedConfigs = new Map<string, string>();

function addedKey(directory: string, name: string) {
  return `${directory}\0${name}`;
}

export interface OpenCodeMcpSyncInput {
  client: OpenCodeClient;
  directory: string;
  servers: readonly AgentMcpServer[];
  sessionServer: { name: string; config: OpenCodeMcpConfig } | null;
}

const directoryLocks = new Map<string, Promise<void>>();

function withDirectoryLock(directory: string, task: () => Promise<void>) {
  const previous = directoryLocks.get(directory) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const settled = next.catch(() => undefined);
  directoryLocks.set(directory, settled);
  void settled.then(() => {
    if (directoryLocks.get(directory) === settled) {
      directoryLocks.delete(directory);
    }
  });
  return next;
}

export function syncOpenCodeMcpServers(input: OpenCodeMcpSyncInput) {
  return withDirectoryLock(input.directory, () => syncServers(input));
}

async function syncServers({
  client,
  directory,
  servers,
  sessionServer,
}: OpenCodeMcpSyncInput) {
  const location = { directory };
  const listed = (await client.mcp.list({ location })).data.map(
    (server) => server.name,
  );
  const running = new Set(listed);
  const desired = openCodeSharedMcpConfigs(servers);
  if (sessionServer) desired.set(sessionServer.name, sessionServer.config);

  for (const [name, config] of desired) {
    const key = addedKey(directory, name);
    if (running.has(name) && addedConfigs.get(key) === configKey(config)) {
      continue;
    }
    await client.mcp.add({ server: name, location, config });
    addedConfigs.set(key, configKey(config));
  }
  for (const name of staleOpenCodeSharedServers(
    listed,
    new Set(desired.keys()),
  )) {
    await client.mcp.remove({ server: name, location });
    addedConfigs.delete(addedKey(directory, name));
  }
}

export async function removeOpenCodeSessionServer(
  client: OpenCodeClient,
  directory: string,
  name: string,
) {
  addedConfigs.delete(addedKey(directory, name));
  await client.mcp.remove({ server: name, location: { directory } });
}

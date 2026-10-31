import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  McpServerConfig,
  McpServerScope,
  McpServerState,
  McpServerStatus,
  McpStatusReport,
} from "@cocurdex/shared";
import {
  loadMcpConfig,
  type McpServerEntry,
} from "@earendil-works/pi-coding-agent/mcp-config";
import {
  createDefaultTransport,
  McpOAuthCredentialStore,
  McpServerConnection,
  McpServerLog,
  McpSignInCancelledError,
  signInMcpServer,
} from "@earendil-works/pi-coding-agent/mcp-runtime";
import { getPiAgentDir } from "./pi-paths";

export interface PiMcpLocation {
  userDataPath: string;
  cwd: string;
  projectTrusted: boolean;
}

function useAgentDir(userDataPath: string) {
  const agentDir = getPiAgentDir(userDataPath);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  return agentDir;
}

function stripPathPrefix(error: string, filePath: string) {
  const prefix = `${filePath}: `;
  return error.startsWith(prefix) ? error.slice(prefix.length) : error;
}

async function withConfigText<T>(
  content: string,
  read: (agentDir: string, configPath: string) => T,
) {
  const agentDir = await mkdtemp(path.join(tmpdir(), "cocurdex-mcp-"));
  const configPath = path.join(agentDir, "mcp.json");
  try {
    await writeFile(configPath, content, "utf8");
    return read(agentDir, configPath);
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
}

export async function validatePiMcpConfigText(content: string) {
  return withConfigText(content, (agentDir, configPath) =>
    loadMcpConfig({
      agentDir,
      cwd: agentDir,
      projectTrusted: false,
    }).errors.map((error) => stripPathPrefix(error, configPath)),
  );
}

export async function validatePiMcpServerConfig(
  name: string,
  config: McpServerConfig,
) {
  const errors = await validatePiMcpConfigText(
    JSON.stringify({ mcpServers: { [name]: config } }),
  );
  return errors[0] ?? null;
}

function toServerState(state: string): McpServerState {
  if (state === "connected" || state === "needs-auth") return state;
  return "failed";
}

function toScope(entry: McpServerEntry): McpServerScope {
  return entry.scope === "project" ? "project" : "global";
}

function createConnection(
  entry: McpServerEntry,
  cwd: string,
  agentDir: string,
  credentials: McpOAuthCredentialStore,
) {
  return new McpServerConnection({
    entry,
    cwd,
    createTransport: createDefaultTransport,
    credentials,
    log: new McpServerLog(path.join(agentDir, "mcp.log")),
    onTools: () => {},
  });
}

function isSignedIn(
  credentials: McpOAuthCredentialStore,
  name: string,
  oauthUrl: string | undefined,
) {
  return (
    oauthUrl !== undefined && credentials.tokens(name, oauthUrl) !== undefined
  );
}

async function probeServer(
  entry: McpServerEntry,
  cwd: string,
  agentDir: string,
  credentials: McpOAuthCredentialStore,
): Promise<McpServerStatus> {
  const connection = createConnection(entry, cwd, agentDir, credentials);
  const oauthUrl = connection.oauthUrl;
  const enabled = entry.config.enabled !== false;
  if (enabled) {
    await connection.getClient().catch(() => undefined);
  }
  const state = enabled ? toServerState(connection.state) : "disabled";
  const status: McpServerStatus = {
    name: entry.name,
    scope: toScope(entry),
    state,
    tools: connection.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
    })),
    error:
      state === "failed" || state === "needs-auth"
        ? (connection.error ?? null)
        : null,
    oauth: oauthUrl !== undefined,
    signedIn: isSignedIn(credentials, entry.name, oauthUrl),
    checkedAt: new Date().toISOString(),
  };
  await connection.close();
  return status;
}

export async function inspectPiMcpServers(
  location: PiMcpLocation & { names?: string[] },
): Promise<McpStatusReport> {
  const agentDir = useAgentDir(location.userDataPath);
  const loaded = loadMcpConfig({
    agentDir,
    cwd: location.cwd,
    projectTrusted: location.projectTrusted,
  });
  const credentials = new McpOAuthCredentialStore();
  const entries = location.names
    ? loaded.servers.filter((entry) => location.names?.includes(entry.name))
    : loaded.servers;
  const servers = await Promise.all(
    entries.map((entry) =>
      probeServer(entry, location.cwd, agentDir, credentials),
    ),
  );
  const configScopes: [string, McpServerScope][] = [
    [path.join(agentDir, "mcp.json"), "global"],
    [path.join(location.cwd, ".pi", "mcp.json"), "project"],
  ];
  const errors: string[] = [];
  for (const error of loaded.errors) {
    const invalid = parseServerConfigError(error, configScopes);
    if (!invalid) {
      errors.push(error);
      continue;
    }
    const listed = servers.some(
      (status) =>
        status.name === invalid.name && status.scope === invalid.scope,
    );
    if (listed) {
      errors.push(error);
      continue;
    }
    if (location.names && !location.names.includes(invalid.name)) continue;
    servers.push(invalidServerStatus(invalid));
  }
  return { servers, errors };
}

interface InvalidServerConfig {
  name: string;
  scope: McpServerScope;
  message: string;
}

function parseServerConfigError(
  error: string,
  configScopes: [string, McpServerScope][],
): InvalidServerConfig | null {
  for (const [configPath, scope] of configScopes) {
    const message = stripPathPrefix(error, configPath);
    if (message === error) continue;
    const match = /^server "([^"]+)"/.exec(message);
    return match?.[1] ? { name: match[1], scope, message } : null;
  }
  return null;
}

function invalidServerStatus(invalid: InvalidServerConfig): McpServerStatus {
  return {
    name: invalid.name,
    scope: invalid.scope,
    state: "failed",
    tools: [],
    error: invalid.message,
    oauth: false,
    signedIn: false,
    checkedAt: new Date().toISOString(),
  };
}

export async function testPiMcpServer(
  location: Omit<PiMcpLocation, "projectTrusted">,
  name: string,
  config: McpServerConfig,
): Promise<McpServerStatus> {
  const agentDir = useAgentDir(location.userDataPath);
  const loaded = await withConfigText(
    JSON.stringify({ mcpServers: { [name]: config } }),
    (tempDir, configPath) => {
      const result = loadMcpConfig({
        agentDir: tempDir,
        cwd: tempDir,
        projectTrusted: false,
      });
      return {
        entry: result.servers[0],
        error: result.errors[0]
          ? stripPathPrefix(result.errors[0], configPath)
          : null,
      };
    },
  );
  if (!loaded.entry) {
    throw new Error(loaded.error ?? `Invalid MCP server "${name}"`);
  }
  const entry: McpServerEntry = {
    ...loaded.entry,
    source: path.join(agentDir, "mcp.json"),
    scope: "global",
  };
  return probeServer(
    entry,
    location.cwd,
    agentDir,
    new McpOAuthCredentialStore(),
  );
}

export interface PiMcpSignIn {
  readonly authUrl: Promise<string | null>;
  readonly done: Promise<void>;
  cancel(): void;
}

function findEntry(location: PiMcpLocation, name: string) {
  const agentDir = useAgentDir(location.userDataPath);
  const entry = loadMcpConfig({
    agentDir,
    cwd: location.cwd,
    projectTrusted: location.projectTrusted,
  }).servers.find((server) => server.name === name);
  if (!entry) {
    throw new Error(`No MCP server named "${name}"`);
  }
  return { agentDir, entry };
}

export function startPiMcpSignIn(
  location: PiMcpLocation,
  name: string,
  timeoutMs: number,
): PiMcpSignIn {
  const { agentDir, entry } = findEntry(location, name);
  const credentials = new McpOAuthCredentialStore();
  const connection = createConnection(
    entry,
    location.cwd,
    agentDir,
    credentials,
  );
  const url = connection.oauthUrl;
  if (!url) {
    throw new Error(
      `MCP server "${name}" does not use OAuth. Only HTTP servers without an Authorization header do.`,
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let resolveAuthUrl!: (url: string | null) => void;
  const authUrl = new Promise<string | null>((resolve) => {
    resolveAuthUrl = resolve;
  });

  const run = async () => {
    try {
      await connection.getClient();
      return;
    } catch {
      if (connection.state !== "needs-auth") {
        throw new Error(connection.error ?? "unknown error");
      }
    }
    await signInMcpServer({
      serverUrl: url,
      store: credentials.forServer(name, url),
      settings: connection.oauthSettings(),
      challenge: connection.challenge,
      prompt: {
        showAuthorizationUrl: (authorizationUrl) =>
          resolveAuthUrl(authorizationUrl.href),
        promptForRedirectUrl: (signal) =>
          new Promise<undefined>((resolve) => {
            if (signal.aborted) resolve(undefined);
            signal.addEventListener("abort", () => resolve(undefined), {
              once: true,
            });
          }),
      },
      signal: controller.signal,
    });
    connection.challenge = undefined;
    await connection.reconnect();
  };

  const done = run()
    .catch((error: unknown) => {
      if (error instanceof McpSignInCancelledError) {
        throw new Error(`Sign-in to MCP server "${name}" was cancelled`);
      }
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      resolveAuthUrl(null);
      void connection.close();
    });
  done.catch(() => undefined);

  return {
    authUrl,
    done,
    cancel: () => controller.abort(),
  };
}

export function signOutPiMcpServer(location: PiMcpLocation, name: string) {
  const { entry } = findEntry(location, name);
  const url = "url" in entry.config ? entry.config.url : undefined;
  if (!url) return false;
  return new McpOAuthCredentialStore().remove(name, url);
}

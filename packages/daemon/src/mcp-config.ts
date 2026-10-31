import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePiMcpConfigText } from "@cocurdex/agent-adapters/pi-mcp";
import {
  type AgentId,
  isValidMcpServerName,
  type McpConfigFile,
  type McpProjectConfigFile,
  type McpServerConfig,
  withMcpServerAgents,
} from "@cocurdex/shared";

const DEFAULT_MCP_CONFIG = '{\n  "mcpServers": {}\n}\n';

type McpConfigObject = Record<string, unknown> & {
  mcpServers: Record<string, McpServerConfig>;
};

export function getMcpConfigPath(userDataPath: string) {
  return path.join(userDataPath, "pi-agent", "mcp.json");
}

export function getProjectMcpConfigPath(workspaceRootPath: string) {
  return path.join(workspaceRootPath, ".pi", "mcp.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMcpConfigObject(content: string): McpConfigObject {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("MCP configuration must be a JSON object");
  }
  const servers = parsed.mcpServers;
  if (!isRecord(servers)) {
    throw new Error('MCP configuration must contain an "mcpServers" object');
  }
  const invalidName = Object.keys(servers).find(
    (name) => !isValidMcpServerName(name),
  );
  if (invalidName !== undefined) {
    throw new Error(
      `MCP server name "${invalidName}" may only contain letters, digits, "_", and "-"`,
    );
  }
  return parsed as McpConfigObject;
}

function formatMcpConfig(config: McpConfigObject) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function validateMcpConfig(content: string) {
  return formatMcpConfig(parseMcpConfigObject(content));
}

function requireServer(config: McpConfigObject, name: string) {
  const server = config.mcpServers[name];
  if (!isRecord(server)) {
    throw new Error(`No MCP server named "${name}"`);
  }
  return server;
}

function renameServerInPlace(
  servers: Record<string, McpServerConfig>,
  previousName: string,
  name: string,
  config: McpServerConfig,
) {
  return Object.fromEntries(
    Object.entries(servers).map(([key, value]) =>
      key === previousName ? [name, config] : [key, value],
    ),
  );
}

export class DaemonMcpConfigService {
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly userDataPath: string) {}

  get configPath() {
    return getMcpConfigPath(this.userDataPath);
  }

  async readConfig(): Promise<McpConfigFile> {
    try {
      return {
        path: this.configPath,
        content: await readFile(this.configPath, "utf8"),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { path: this.configPath, content: DEFAULT_MCP_CONFIG };
      }
      throw error;
    }
  }

  async readServers(): Promise<Record<string, McpServerConfig>> {
    const { content } = await this.readConfig();
    return parseMcpConfigObject(content).mcpServers;
  }

  async readProjectConfig(
    workspaceRootPath: string,
  ): Promise<McpProjectConfigFile> {
    const configPath = getProjectMcpConfigPath(workspaceRootPath);
    try {
      return { path: configPath, content: await readFile(configPath, "utf8") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { path: configPath, content: null };
      }
      throw error;
    }
  }

  saveConfig(content: string): Promise<McpConfigFile> {
    return this.enqueue(() => this.persist(parseMcpConfigObject(content)));
  }

  saveServer(
    name: string,
    config: McpServerConfig,
    previousName?: string,
  ): Promise<McpConfigFile> {
    return this.mutate((current) => {
      const renamed = previousName !== undefined && previousName !== name;
      const previous = current.mcpServers[previousName ?? name];
      const next =
        config.cocurdex === undefined && isRecord(previous?.cocurdex)
          ? { ...config, cocurdex: previous.cocurdex }
          : config;
      if (renamed) {
        requireServer(current, previousName);
        if (current.mcpServers[name] !== undefined) {
          throw new Error(`An MCP server named "${name}" already exists`);
        }
      }
      return {
        ...current,
        mcpServers: renamed
          ? renameServerInPlace(current.mcpServers, previousName, name, next)
          : { ...current.mcpServers, [name]: next },
      };
    });
  }

  mergeServers(
    servers: Record<string, McpServerConfig>,
  ): Promise<McpConfigFile> {
    return this.mutate((current) => ({
      ...current,
      mcpServers: { ...current.mcpServers, ...servers },
    }));
  }

  removeServer(name: string): Promise<McpConfigFile> {
    return this.mutate((current) => {
      requireServer(current, name);
      const { [name]: _removed, ...rest } = current.mcpServers;
      return { ...current, mcpServers: rest };
    });
  }

  setServerEnabled(name: string, enabled: boolean): Promise<McpConfigFile> {
    return this.mutate((current) => {
      const { enabled: _previous, ...server } = requireServer(current, name);
      return {
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [name]: enabled ? server : { ...server, enabled: false },
        },
      };
    });
  }

  setServerAgents(name: string, agents: AgentId[]): Promise<McpConfigFile> {
    return this.mutate((current) => ({
      ...current,
      mcpServers: {
        ...current.mcpServers,
        [name]: withMcpServerAgents(requireServer(current, name), agents),
      },
    }));
  }

  private mutate(
    change: (current: McpConfigObject) => McpConfigObject,
  ): Promise<McpConfigFile> {
    return this.enqueue(async () => {
      const { content } = await this.readConfig();
      return this.persist(change(parseMcpConfigObject(content)));
    });
  }

  // Multiple daemon clients can save concurrently; a shared temp path would
  // let one rename consume another call's file, so each write gets a unique
  // temp name and saves run in request order.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.saveChain.then(task);
    this.saveChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async persist(config: McpConfigObject): Promise<McpConfigFile> {
    const formatted = formatMcpConfig(config);
    const [error] = await validatePiMcpConfigText(formatted);
    if (error) {
      throw new Error(error);
    }
    await mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, formatted, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.configPath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    return { path: this.configPath, content: formatted };
  }
}

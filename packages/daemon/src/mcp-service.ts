import { homedir } from "node:os";
import {
  inspectPiMcpServers,
  type PiMcpLocation,
  signOutPiMcpServer,
  testPiMcpServer,
  validatePiMcpServerConfig,
} from "@cocurdex/agent-adapters/pi-mcp";
import {
  type AgentId,
  type AgentMcpServer,
  type AgentMcpUnsupportedReason,
  type McpServerConfig,
  mcpServerTargetsAgent,
  PI_MCP_AGENT_ID,
  toAgentMcpServer,
} from "@cocurdex/shared";
import { DaemonMcpConfigService } from "./mcp-config";
import { listMcpImportFiles, scanMcpImports } from "./mcp-imports";
import { McpLoginSessions } from "./mcp-logins";

export type WorkspaceRootResolver = (
  workspaceId: string,
) => Promise<string | null>;

export class DaemonMcpService {
  readonly config: DaemonMcpConfigService;
  readonly logins = new McpLoginSessions();

  constructor(
    private readonly userDataPath: string,
    private readonly resolveWorkspaceRoot: WorkspaceRootResolver,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    this.config = new DaemonMcpConfigService(userDataPath);
  }

  private async workspaceRoot(workspaceId: string) {
    const rootPath = await this.resolveWorkspaceRoot(workspaceId);
    if (!rootPath) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return rootPath;
  }

  async location(workspaceId?: string): Promise<PiMcpLocation> {
    if (!workspaceId) {
      return {
        userDataPath: this.userDataPath,
        cwd: homedir(),
        projectTrusted: false,
      };
    }
    return {
      userDataPath: this.userDataPath,
      cwd: await this.workspaceRoot(workspaceId),
      projectTrusted: true,
    };
  }

  async readProjectConfig(workspaceId: string) {
    return this.config.readProjectConfig(await this.workspaceRoot(workspaceId));
  }

  async status(workspaceId?: string, names?: string[]) {
    return inspectPiMcpServers({
      ...(await this.location(workspaceId)),
      names,
    });
  }

  async test(name: string, config: McpServerConfig, workspaceId?: string) {
    const { userDataPath, cwd } = await this.location(workspaceId);
    return testPiMcpServer({ userDataPath, cwd }, name, config);
  }

  async startLogin(name: string, workspaceId?: string) {
    return this.logins.start(await this.location(workspaceId), name);
  }

  async logout(name: string, workspaceId?: string) {
    return {
      removed: signOutPiMcpServer(await this.location(workspaceId), name),
    };
  }

  async scanImports(workspaceId?: string) {
    const workspaceRootPath = workspaceId
      ? await this.workspaceRoot(workspaceId)
      : null;
    return scanMcpImports({
      files: listMcpImportFiles(homedir(), workspaceRootPath, this.env),
      current: await this.config.readServers(),
      validate: validatePiMcpServerConfig,
    });
  }

  async serversForAgent(agentId: AgentId): Promise<AgentMcpServer[]> {
    if (agentId === PI_MCP_AGENT_ID) {
      return [];
    }
    const servers = await this.config.readServers();
    return Object.entries(servers).flatMap(([name, config]) => {
      if (!mcpServerTargetsAgent(config, agentId)) {
        return [];
      }
      const converted = toAgentMcpServer(name, config, this.env);
      return "server" in converted ? [converted.server] : [];
    });
  }

  async injectionSupport(): Promise<
    Record<string, AgentMcpUnsupportedReason | null>
  > {
    const servers = await this.config.readServers();
    return Object.fromEntries(
      Object.entries(servers).map(([name, config]) => {
        const converted = toAgentMcpServer(name, config, this.env);
        return [
          name,
          "unsupported" in converted ? converted.unsupported : null,
        ];
      }),
    );
  }

  dispose() {
    this.logins.cancelAll();
  }
}

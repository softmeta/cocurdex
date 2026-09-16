import type {
  AgentToolCallerContext,
  AgentToolsBinding,
  SessionRecord,
} from "@cocurdex/shared";
import { buildAgentToolStdioSpec } from "./stdio-spec";
import { AgentToolTokenRegistry } from "./token-registry";
import { AgentToolError, AgentToolRegistry } from "./tool-registry";

export interface AgentToolBridgeOptions {
  userDataPath: string;
  entryPath: string;
  execPath?: string;
  execArgv?: readonly string[];
  getSession(sessionId: string): Promise<SessionRecord | null>;
  getTeamId?(sessionId: string): Promise<string | null>;
}

export class AgentToolBridge {
  readonly registry = new AgentToolRegistry();
  private readonly tokens = new AgentToolTokenRegistry();

  constructor(private readonly options: AgentToolBridgeOptions) {}

  bindingFor(session: Pick<SessionRecord, "id">): AgentToolsBinding {
    const token = this.tokens.issue(session.id);
    return {
      token,
      stdio: buildAgentToolStdioSpec({
        execPath: this.options.execPath ?? process.execPath,
        execArgv: this.options.execArgv ?? process.execArgv,
        entryPath: this.options.entryPath,
        token,
        userDataPath: this.options.userDataPath,
      }),
    };
  }

  revoke(sessionId: string) {
    this.tokens.revoke(sessionId);
  }

  async catalog(token: string) {
    return this.registry.catalog(await this.resolveCaller(token));
  }

  async call(token: string, name: string, input: unknown) {
    return this.registry.call(await this.resolveCaller(token), name, input);
  }

  private async resolveCaller(token: string): Promise<AgentToolCallerContext> {
    const sessionId = this.tokens.resolve(token);
    const session = sessionId ? await this.options.getSession(sessionId) : null;
    if (!sessionId || !session) {
      throw new AgentToolError(
        "UNAUTHORIZED_AGENT_TOOL",
        "Agent tool token is not valid for any session",
      );
    }
    return {
      sessionId,
      sessionKind: session.sessionKind ?? "main",
      workspaceId: session.workspaceId,
      teamId: (await this.options.getTeamId?.(sessionId)) ?? null,
    };
  }
}

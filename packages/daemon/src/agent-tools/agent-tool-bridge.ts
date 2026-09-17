import type { AgentToolInvoker } from "@cocurdex/agent-core";
import type {
  AgentToolCallerContext,
  AgentToolsBinding,
  SessionRecord,
} from "@cocurdex/shared";
import { AgentToolTokenRegistry } from "./token-registry";
import { AgentToolError, AgentToolRegistry } from "./tool-registry";

export interface AgentToolBridgeOptions {
  url: string | null;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  getTeamId?(sessionId: string): Promise<string | null>;
}

export interface AgentToolSessionBinding {
  binding: AgentToolsBinding;
  invoker: AgentToolInvoker;
}

export class AgentToolBridge {
  readonly registry = new AgentToolRegistry();
  private readonly tokens = new AgentToolTokenRegistry();

  constructor(private readonly options: AgentToolBridgeOptions) {}

  bind(session: Pick<SessionRecord, "id">): AgentToolSessionBinding | null {
    const url = this.options.url;
    if (url === null) return null;
    const token = this.tokens.issue(session.id);
    return {
      binding: { token, url },
      invoker: {
        catalog: () => this.catalog(token),
        call: (name, input) => this.call(token, name, input),
      },
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

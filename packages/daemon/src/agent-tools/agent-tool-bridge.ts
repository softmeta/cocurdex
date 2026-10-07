import type { AgentToolInvoker } from "@cocurdex/agent-core";
import {
  type AgentToolCallerContext,
  type AgentToolCatalog,
  type AgentToolsBinding,
  renderTeamRosterInstructions,
  type SessionRecord,
  type TeamRoster,
} from "@cocurdex/shared";
import { orchestrationInstructions } from "./orchestration-instructions";
import { AgentToolTokenRegistry } from "./token-registry";
import { AgentToolError, AgentToolRegistry } from "./tool-registry";

export interface AgentToolBridgeOptions {
  url: string | null;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  getTeamId?(sessionId: string): Promise<string | null>;
  getLeadRoster?(sessionId: string): Promise<TeamRoster | null>;
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

  async catalog(token: string): Promise<AgentToolCatalog> {
    const catalog = this.registry.catalog(await this.resolveCaller(token));
    const instructions = await this.instructions(catalog);
    return instructions ? { ...catalog, instructions } : catalog;
  }

  async call(token: string, name: string, input: unknown) {
    return this.registry.call(await this.resolveCaller(token), name, input);
  }

  private async instructions(catalog: AgentToolCatalog) {
    const { caller } = catalog;
    const roster =
      caller.sessionKind === "main" && caller.teamId
        ? await this.options.getLeadRoster?.(caller.sessionId)
        : null;
    const sections = [
      orchestrationInstructions(catalog),
      roster ? renderTeamRosterInstructions(roster) : undefined,
    ].filter((section): section is string => Boolean(section));
    return sections.length > 0 ? sections.join("\n\n") : undefined;
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

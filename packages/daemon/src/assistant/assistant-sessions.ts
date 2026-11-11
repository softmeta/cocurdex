import {
  type AgentId,
  isAssistantSessionId,
  newAssistantSessionId,
  type SessionConfiguration,
  type SessionRecord,
} from "@cocurdex/shared";
import type { AgentCatalog } from "../agents";
import type { DaemonState } from "../state";

export interface AssistantSessionsOptions {
  state: DaemonState;
  agents: Pick<AgentCatalog, "readDisabledAgentIds" | "detectAgents">;
  saveSessionConfiguration: (
    configuration: SessionConfiguration,
  ) => Promise<SessionRecord>;
  announceSessionsChanged: () => void;
}

export class AssistantSessions {
  constructor(private readonly options: AssistantSessionsOptions) {}

  async getOrCreate(input: { workspaceId: string }) {
    const existing = await this.mostRecentAssistantSession(input.workspaceId);
    if (!existing) {
      return this.create(input.workspaceId);
    }
    const snapshotSource = await this.assistantSnapshotSource(
      input.workspaceId,
      existing.agentType,
    );
    if (!existing.providerSnapshot && snapshotSource) {
      const updated: SessionRecord = {
        ...existing,
        providerSnapshot: snapshotSource,
        updatedAt: new Date().toISOString(),
      };
      await this.options.state.saveSession(updated);
      this.options.announceSessionsChanged();
      return updated;
    }
    return existing;
  }

  async create(workspaceId: string) {
    const agentType =
      (await this.mostRecentAssistantSession(workspaceId))?.agentType ??
      (await this.recentSessionAgentType(workspaceId)) ??
      (await this.defaultAssistantAgentId());
    return this.options.saveSessionConfiguration({
      id: newAssistantSessionId(),
      workspaceId,
      title: "Assistant",
      agentType,
      writeMode: "read-only",
      sessionModeId: null,
      permissionMode: undefined,
      agentRoleId: null,
      providerSnapshot: await this.assistantSnapshotSource(
        workspaceId,
        agentType,
      ),
      worktreePath: null,
      peerInbound: "refuse",
    });
  }

  private async mostRecentAssistantSession(
    workspaceId: string,
  ): Promise<SessionRecord | null> {
    const workspace = (await this.options.state.listWorkspaces()).find(
      (candidate) => candidate.id === workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const [sessions, disabledIds] = await Promise.all([
      this.options.state.listSessions(),
      this.options.agents.readDisabledAgentIds(),
    ]);
    return (
      sessions.find(
        (session) =>
          session.workspaceId === workspaceId &&
          isAssistantSessionId(session.id) &&
          !disabledIds.has(session.agentType),
      ) ?? null
    );
  }

  private async recentSessionAgentType(
    workspaceId: string,
  ): Promise<AgentId | null> {
    const [sessions, disabledIds] = await Promise.all([
      this.options.state.listSessions(),
      this.options.agents.readDisabledAgentIds(),
    ]);
    return (
      sessions.find(
        (session) =>
          session.workspaceId === workspaceId &&
          !disabledIds.has(session.agentType),
      )?.agentType ?? null
    );
  }

  private async assistantSnapshotSource(
    workspaceId: string,
    agentType: AgentId,
  ) {
    const sessions = await this.options.state.listSessions();
    return (
      sessions.find(
        (session) =>
          session.workspaceId === workspaceId &&
          session.agentType === agentType &&
          session.providerSnapshot,
      )?.providerSnapshot ?? null
    );
  }

  private async defaultAssistantAgentId(): Promise<AgentId> {
    const agent = (await this.options.agents.detectAgents()).find(
      (item) => item.enabled !== false && item.availability === "available",
    );
    if (!agent) {
      throw new Error("No agent is available on this machine.");
    }
    return agent.id;
  }
}

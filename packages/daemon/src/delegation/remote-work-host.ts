import crypto from "node:crypto";
import type {
  AgentRoleRecord,
  DelegatedWorkWaitingFor,
  DelegationCatalog,
  MessageOrigin,
  MessageRecord,
  RemoteWorkSendPayload,
  RemoteWorkStarted,
  RemoteWorkStartPayload,
  RemoteWorkStatus,
  RunRecord,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { renderDelegatedWorkBriefing } from "@cocurdex/shared";
import {
  createWorkSession,
  followUpDelivery,
  type WorkSessionDependencies,
} from "./work-session";
import {
  buildCatalog,
  DelegationError,
  requirePrompt,
  resolveRole,
  resolveWorkspace,
  workState,
  workTitle,
} from "./work-targets";

export interface RemoteWorkSender {
  hostName: string;
  senderName: string;
}

export interface RemoteWorkHostDependencies extends WorkSessionDependencies {
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  listRoles(): Promise<AgentRoleRecord[]>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  stopSession(sessionId: string): Promise<unknown>;
  latestRun(sessionId: string): RunRecord | null;
  getRunReply(sessionId: string, runId: string): Promise<MessageRecord | null>;
  waitingFor(sessionId: string): DelegatedWorkWaitingFor | null;
  announceChanged(): void;
}

const MAX_STATUS_BATCH = 100;

function senderOrigin(sender: RemoteWorkSender): MessageOrigin {
  return {
    kind: "remoteHost",
    hostName: sender.hostName,
    senderName: sender.senderName,
  };
}

export class RemoteWorkHost {
  constructor(private readonly deps: RemoteWorkHostDependencies) {}

  async catalog(): Promise<DelegationCatalog> {
    const [workspaces, roles] = await Promise.all([
      this.deps.listWorkspaces(),
      this.deps.listRoles(),
    ]);
    return buildCatalog(workspaces, roles, []);
  }

  async start(
    payload: RemoteWorkStartPayload,
    sender: RemoteWorkSender,
  ): Promise<RemoteWorkStarted> {
    const prompt = requirePrompt(
      payload.prompt,
      "Describe the task to delegate.",
    );
    const workspaces = await this.deps.listWorkspaces();
    const workspace = resolveWorkspace(workspaces, payload.workspace);
    const role = payload.agentRole
      ? resolveRole(await this.deps.listRoles(), payload.agentRole)
      : null;
    const title = workTitle(prompt, payload.title);
    const session = await createWorkSession(this.deps, {
      workspaceId: workspace.id,
      agentRoleId: role?.id ?? null,
      title,
      isolateWorktree: payload.isolateWorktree === true,
    });
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      content: renderDelegatedWorkBriefing(sender.senderName, prompt),
      delivery: "start-new-run",
      origin: senderOrigin(sender),
    });
    this.deps.announceChanged();
    return {
      sessionId: session.id,
      title: session.title,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      agentType: session.agentType,
      agentRoleId: session.agentRoleId ?? null,
      worktreePath: session.worktreePath ?? null,
    };
  }

  async status(sessionIds: readonly string[]): Promise<RemoteWorkStatus[]> {
    const statuses: RemoteWorkStatus[] = [];
    for (const sessionId of new Set(sessionIds.slice(0, MAX_STATUS_BATCH))) {
      const session = await this.deps.getSession(sessionId);
      if (session) statuses.push(await this.describe(session));
    }
    return statuses;
  }

  async send(
    payload: RemoteWorkSendPayload,
    sender: RemoteWorkSender,
  ): Promise<RemoteWorkStatus> {
    const message = requirePrompt(payload.message, "The message is empty.");
    const session = await this.requireSession(payload.sessionId);
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      content: renderDelegatedWorkBriefing(sender.senderName, message),
      delivery: await followUpDelivery(this.deps, session),
      origin: senderOrigin(sender),
    });
    return this.describe(session);
  }

  async stop(target: { sessionId: string }): Promise<RemoteWorkStatus> {
    await this.requireSession(target.sessionId);
    await this.deps.stopSession(target.sessionId);
    return this.describe(await this.requireSession(target.sessionId));
  }

  private async requireSession(sessionId: string) {
    const session = await this.deps.getSession(sessionId);
    if (!session) {
      throw new DelegationError(
        "work_not_found",
        "No work session on this computer has this id.",
      );
    }
    return session;
  }

  private async describe(session: SessionRecord): Promise<RemoteWorkStatus> {
    const active = this.deps.hasActiveRun(session.id);
    const run = this.deps.latestRun(session.id);
    const finished = run && run.status !== "running" ? run : null;
    const reply = finished
      ? await this.deps.getRunReply(session.id, finished.id)
      : null;
    return {
      sessionId: session.id,
      title: session.title,
      state: workState(session, active, run),
      waitingFor: this.deps.waitingFor(session.id),
      updatedAt: session.updatedAt,
      latestRun: run
        ? { id: run.id, status: run.status, error: run.error ?? null }
        : null,
      reply: reply?.content ?? null,
    };
  }
}

import crypto from "node:crypto";
import type { DelegationRepository, DelegationRow } from "@cocurdex/db";
import {
  type AgentEvent,
  type AgentInputDelivery,
  type AgentRoleRecord,
  type CreateSessionPayload,
  type DelegatedWorkRecord,
  type DelegatedWorkState,
  type DelegationCatalog,
  decideRequesterReport,
  delegatedWorkOutcome,
  delegatedWorkReportMessageId,
  isChatWorkspaceId,
  isPersonalWorkspaceId,
  type MessageOrigin,
  type MessageRecord,
  type RunRecord,
  renderDelegatedWorkBriefing,
  renderDelegatedWorkReport,
  type SendDelegatedWorkPayload,
  type SendSessionCommand,
  type SessionRecord,
  type StartDelegatedWorkPayload,
  type TeamTemplateRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";

export type DelegationErrorCode =
  | "persona_not_found"
  | "workspace_not_found"
  | "workspace_ambiguous"
  | "role_not_found"
  | "template_not_found"
  | "role_and_template"
  | "work_not_found"
  | "empty_prompt";

export class DelegationError extends Error {
  override readonly name = "DelegationError";

  constructor(
    readonly code: DelegationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DelegationPersona {
  id: string;
  name: string;
  homeSessionId: string;
}

export interface DelegationModuleDependencies {
  repository: DelegationRepository;
  getPersona(personaId: string): Promise<DelegationPersona | null>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  createSession(input: CreateSessionPayload): Promise<SessionRecord>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  listRoles(): Promise<AgentRoleRecord[]>;
  listTemplates(): Promise<TeamTemplateRecord[]>;
  createTeam(input: {
    leadSessionId: string;
    templateId: string;
  }): Promise<unknown>;
  createWorktree(input: {
    workspaceId: string;
    branch: string;
  }): Promise<{ path: string }>;
  sendSessionMessage(command: SendSessionCommand): Promise<MessageRecord>;
  submitReport(
    command: SendSessionCommand,
    options: { hold: boolean },
  ): Promise<MessageRecord>;
  stopSession(sessionId: string): Promise<unknown>;
  hasActiveRun(sessionId: string): boolean;
  supportsSteering(session: SessionRecord): Promise<boolean>;
  latestRun(sessionId: string): RunRecord | null;
  getRunReply(sessionId: string, runId: string): Promise<MessageRecord | null>;
  getMessage(messageId: string): Promise<MessageRecord | null>;
  track(work: Promise<unknown>): void;
  onReportFailed(error: unknown): void;
  announceChanged(): void;
  now?(): string;
}

const LIST_LIMIT = 50;

function matchesName(name: string, query: string) {
  return name.trim().toLowerCase() === query.trim().toLowerCase();
}

function findByIdOrName<T extends { id: string; name: string }>(
  items: readonly T[],
  query: string,
) {
  return (
    items.find((item) => item.id === query) ??
    items.find((item) => matchesName(item.name, query)) ??
    null
  );
}

function isWorkWorkspace(workspace: WorkspaceRecord) {
  return (
    !isChatWorkspaceId(workspace.id) && !isPersonalWorkspaceId(workspace.id)
  );
}

function branchSlug(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || "task";
}

export class DelegationModule {
  private reports: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DelegationModuleDependencies) {}

  async catalog(): Promise<DelegationCatalog> {
    const [workspaces, roles, templates] = await Promise.all([
      this.deps.listWorkspaces(),
      this.deps.listRoles(),
      this.deps.listTemplates(),
    ]);
    const roleNames = new Map(roles.map((role) => [role.id, role.name]));
    return {
      workspaces: workspaces.filter(isWorkWorkspace).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        rootPaths: workspace.rootPaths,
      })),
      agentRoles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        agentType: role.agentId,
      })),
      teamTemplates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        members: template.members.map(
          (member) => roleNames.get(member.agentRoleId) ?? member.agentRoleId,
        ),
      })),
    };
  }

  async start(
    payload: StartDelegatedWorkPayload,
  ): Promise<DelegatedWorkRecord> {
    const prompt = payload.prompt.trim();
    if (!prompt) {
      throw new DelegationError(
        "empty_prompt",
        "Describe the task to delegate.",
      );
    }
    if (payload.agentRole && payload.teamTemplate) {
      throw new DelegationError(
        "role_and_template",
        "Pass either an agent role or a team template, not both.",
      );
    }
    const persona = await this.requirePersona(payload.personaId);
    const workspace = await this.resolveWorkspace(payload.workspace);
    const role = payload.agentRole
      ? await this.resolveRole(payload.agentRole)
      : null;
    const template = payload.teamTemplate
      ? await this.resolveTemplate(payload.teamTemplate)
      : null;
    const title = payload.title?.trim() || prompt.split("\n")[0].slice(0, 80);
    const created = await this.deps.createSession({
      workspaceId: workspace.id,
      agentRoleId: role?.id ?? template?.members[0]?.agentRoleId ?? null,
      title,
    });
    const session = payload.isolateWorktree
      ? await this.isolate(created, title)
      : created;
    if (template) {
      await this.deps.createTeam({
        leadSessionId: session.id,
        templateId: template.id,
      });
    }
    const row: DelegationRow = {
      workSessionId: session.id,
      personaId: persona.id,
      requesterSessionId: persona.homeSessionId,
      teamTemplateId: template?.id ?? null,
      createdAt: this.now(),
    };
    this.deps.repository.insert(row);
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      content: renderDelegatedWorkBriefing(persona.name, prompt),
      delivery: "start-new-run",
      origin: this.personaOrigin(persona),
    });
    this.deps.announceChanged();
    return this.describe(row, session, [workspace]);
  }

  async list(personaId: string): Promise<DelegatedWorkRecord[]> {
    await this.requirePersona(personaId);
    const workspaces = await this.deps.listWorkspaces();
    const records: DelegatedWorkRecord[] = [];
    for (const row of this.deps.repository.listByPersona(
      personaId,
      LIST_LIMIT,
    )) {
      const session = await this.deps.getSession(row.workSessionId);
      if (!session) {
        this.deps.repository.delete(row.workSessionId);
        continue;
      }
      records.push(this.describe(row, session, workspaces));
    }
    return records;
  }

  async send(payload: SendDelegatedWorkPayload): Promise<DelegatedWorkRecord> {
    const message = payload.message.trim();
    if (!message) {
      throw new DelegationError("empty_prompt", "The message is empty.");
    }
    const { row, session } = await this.requireWork(payload);
    const persona = await this.requirePersona(payload.personaId);
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      content: renderDelegatedWorkBriefing(persona.name, message),
      delivery: await this.followUpDelivery(session),
      origin: this.personaOrigin(persona),
    });
    return this.describe(row, session, await this.deps.listWorkspaces());
  }

  async stop(target: {
    personaId: string;
    sessionId: string;
  }): Promise<DelegatedWorkRecord> {
    const { row } = await this.requireWork(target);
    await this.deps.stopSession(target.sessionId);
    const session = await this.deps.getSession(target.sessionId);
    if (!session) throw this.workNotFound();
    return this.describe(row, session, await this.deps.listWorkspaces());
  }

  forgetPersona(personaId: string) {
    this.deps.repository.deleteByPersona(personaId);
  }

  async onAgentEvent(event: AgentEvent) {
    if (event.type !== "run.updated" || event.run.status === "running") return;
    const row = this.deps.repository.get(event.sessionId);
    if (!row) return;
    const run = event.run;
    this.enqueue(() => this.report(row, run, false));
  }

  async recoverReports() {
    for (const row of this.deps.repository.list()) {
      const run = this.deps.latestRun(row.workSessionId);
      if (!run || run.status === "running") continue;
      await this.report(row, run, true).catch(() => undefined);
    }
  }

  private enqueue(work: () => Promise<void>) {
    const next = this.reports
      .then(work)
      .catch((error: unknown) => this.deps.onReportFailed(error));
    this.reports = next;
    this.deps.track(next);
  }

  private async report(
    row: DelegationRow,
    run: RunRecord,
    recovering: boolean,
  ) {
    const messageId = delegatedWorkReportMessageId(run.id);
    if (await this.deps.getMessage(messageId)) return;
    const [work, home] = await Promise.all([
      this.deps.getSession(row.workSessionId),
      this.deps.getSession(row.requesterSessionId),
    ]);
    if (!work) return;
    const decision = decideRequesterReport({
      dropped: false,
      requesterArchived: !home || Boolean(home.archivedAt),
      requesterHasActiveRun: this.deps.hasActiveRun(row.requesterSessionId),
      requesterSupportsSteering: home
        ? await this.deps.supportsSteering(home)
        : false,
      recovering,
    });
    if (decision.kind === "skip") return;
    const reply = await this.deps.getRunReply(work.id, run.id);
    await this.deps.submitReport(
      {
        sessionId: row.requesterSessionId,
        messageId,
        content: renderDelegatedWorkReport({
          title: work.title,
          outcome: delegatedWorkOutcome(run.status),
          error: run.error ?? null,
          reply: reply?.content ?? null,
        }),
        delivery:
          decision.delivery === "hold" ? "queue-after-run" : decision.delivery,
        origin: {
          kind: "peer",
          sessionId: work.id,
          sessionTitle: work.title,
        },
      },
      { hold: decision.delivery === "hold" },
    );
  }

  private async followUpDelivery(
    session: SessionRecord,
  ): Promise<AgentInputDelivery> {
    if (!this.deps.hasActiveRun(session.id)) return "start-new-run";
    return (await this.deps.supportsSteering(session))
      ? "steer-active-run"
      : "queue-after-run";
  }

  private async isolate(session: SessionRecord, title: string) {
    const { path } = await this.deps.createWorktree({
      workspaceId: session.workspaceId,
      branch: `assistant/${branchSlug(title)}-${session.id.slice(0, 6)}`,
    });
    const isolated = { ...session, worktreePath: path };
    await this.deps.saveSession(isolated);
    return isolated;
  }

  private personaOrigin(persona: DelegationPersona): MessageOrigin {
    return {
      kind: "peer",
      sessionId: persona.homeSessionId,
      sessionTitle: persona.name,
    };
  }

  private describe(
    row: DelegationRow,
    session: SessionRecord,
    workspaces: readonly WorkspaceRecord[],
  ): DelegatedWorkRecord {
    const workspace = workspaces.find(
      (item) => item.id === session.workspaceId,
    );
    return {
      sessionId: session.id,
      personaId: row.personaId,
      title: session.title,
      workspaceId: session.workspaceId,
      workspaceName: workspace?.name ?? session.workspaceId,
      agentType: session.agentType,
      agentRoleId: session.agentRoleId ?? null,
      teamTemplateId: row.teamTemplateId,
      worktreePath: session.worktreePath ?? null,
      state: this.stateOf(session),
      createdAt: row.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private stateOf(session: SessionRecord): DelegatedWorkState {
    if (session.archivedAt) return "archived";
    if (this.deps.hasActiveRun(session.id)) return "running";
    return this.deps.latestRun(session.id)?.status ?? "idle";
  }

  private async requirePersona(personaId: string) {
    const persona = await this.deps.getPersona(personaId);
    if (!persona) {
      throw new DelegationError("persona_not_found", "Persona was not found.");
    }
    return persona;
  }

  private async requireWork(target: { personaId: string; sessionId: string }) {
    const row = this.deps.repository.get(target.sessionId);
    if (!row || row.personaId !== target.personaId) throw this.workNotFound();
    const session = await this.deps.getSession(target.sessionId);
    if (!session) throw this.workNotFound();
    return { row, session };
  }

  private workNotFound() {
    return new DelegationError(
      "work_not_found",
      "No work session you delegated has this id.",
    );
  }

  private async resolveWorkspace(query: string) {
    const workspaces = (await this.deps.listWorkspaces()).filter(
      isWorkWorkspace,
    );
    const byId = workspaces.find((workspace) => workspace.id === query);
    if (byId) return byId;
    const byName = workspaces.filter((workspace) =>
      matchesName(workspace.name, query),
    );
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      throw new DelegationError(
        "workspace_ambiguous",
        `Several workspaces are named "${query}"; pass its id.`,
      );
    }
    throw new DelegationError(
      "workspace_not_found",
      `No workspace matches "${query}". List the workspaces first.`,
    );
  }

  private async resolveRole(query: string) {
    const role = findByIdOrName(await this.deps.listRoles(), query);
    if (!role) {
      throw new DelegationError(
        "role_not_found",
        `No agent role matches "${query}".`,
      );
    }
    return role;
  }

  private async resolveTemplate(query: string) {
    const template = findByIdOrName(await this.deps.listTemplates(), query);
    if (!template) {
      throw new DelegationError(
        "template_not_found",
        `No team template matches "${query}".`,
      );
    }
    return template;
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }
}

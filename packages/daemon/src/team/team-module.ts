import crypto from "node:crypto";
import type { TeamRepository } from "@cocurdex/db";
import {
  type AgentEvent,
  type AgentRoleRecord,
  canSpawnTeammate,
  checkTeamTaskUpdate,
  type MessageRecord,
  renderTeammateBriefing,
  renderTeammateReport,
  type SaveTeamTemplatePayload,
  type SendPeerMessagePayload,
  type SendPeerMessageResult,
  type SendSessionCommand,
  type SessionRecord,
  type SpawnTeammatePayload,
  type SpawnTeammateRejection,
  type SpawnTeamTemplatePayload,
  supportsAgentTeam,
  TEAM_MAX_MEMBERS,
  TEAM_NAME_PATTERN,
  TEAM_TASK_STATUSES,
  TEAM_TEMPLATES_SETTING_KEY,
  type TeamChangedEvent,
  type TeamMemberRecord,
  type TeammateReportOutcome,
  type TeamRecord,
  type TeamSnapshot,
  type TeamTaskRecord,
  type TeamTaskRejection,
  type TeamTaskStatus,
  type TeamTemplateRecord,
  teamMemberEventFromSessionStatus,
  transitionTeamMember,
  validateSessionId,
} from "@cocurdex/shared";

export type TeamErrorCode =
  | SpawnTeammateRejection
  | TeamTaskRejection
  | "team_not_found"
  | "unsupported_agent"
  | "member_not_found"
  | "lead_not_found"
  | "lead_not_main"
  | "TASK_CONFLICT"
  | "TASK_NOT_FOUND"
  | "invalid_status"
  | "template_not_found"
  | "invalid_template"
  | "members_busy";

export class TeamError extends Error {
  override readonly name = "TeamError";

  constructor(
    readonly code: TeamErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export interface TeamModuleDependencies {
  repository: TeamRepository;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  getAgentRole(id: string): Promise<AgentRoleRecord | null>;
  listAgentRoles(): Promise<AgentRoleRecord[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, valueJson: string): Promise<void>;
  sendSessionMessage(command: SendSessionCommand): Promise<MessageRecord>;
  sendPeerMessage(
    payload: SendPeerMessagePayload,
    renderEnvelope: (origin: unknown, content: string) => string,
  ): Promise<SendPeerMessageResult>;
  stopSession(sessionId: string): Promise<unknown>;
  isSessionBusy(sessionId: string): boolean;
  getMessage(messageId: string): Promise<MessageRecord | null>;
  createWorktree?(input: {
    workspaceId: string;
    branch: string;
  }): Promise<{ path: string }>;
  broadcast(event: TeamChangedEvent): void;
  now?(): string;
  createId?(): string;
}

export interface TeamTaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeSessionId: string | null;
  revision: number;
  blockedBy: string[];
  blocked: boolean;
  evidence: string | null;
}

export interface TeamTaskCreateInput {
  title: string;
  description?: string;
  blockedBy?: string[];
}

export interface TeamTaskUpdateInput {
  taskId: string;
  status?: TeamTaskStatus;
  assignee?: "me" | null;
  evidence?: string;
}

function isTeamTaskStatus(value: string): value is TeamTaskStatus {
  return (TEAM_TASK_STATUSES as readonly string[]).includes(value);
}

function nextAssignee(
  task: TeamTaskRecord,
  assignee: TeamTaskUpdateInput["assignee"],
  sessionId: string,
) {
  if (assignee === undefined) return task.assigneeSessionId;
  return assignee === "me" ? sessionId : null;
}

function summarizeTasks(tasks: TeamTaskRecord[]): TeamTaskSummary[] {
  const statusById = new Map(tasks.map((task) => [task.id, task.status]));
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeSessionId: task.assigneeSessionId,
    revision: task.revision,
    blockedBy: task.blockedBy,
    blocked: task.blockedBy.some((id) => statusById.get(id) !== "done"),
    evidence: task.evidence,
  }));
}

export interface TeamRoleSummary {
  id: string;
  name: string;
  agentType: AgentRoleRecord["agentId"];
  model: string | null;
  permissionMode: AgentRoleRecord["permissionMode"];
}

function summarizeRole(role: AgentRoleRecord): TeamRoleSummary {
  return {
    id: role.id,
    name: role.name,
    agentType: role.agentId,
    model: role.modelName ?? role.modelId,
    permissionMode: role.permissionMode,
  };
}

function parseTemplates(raw: string | null): TeamTemplateRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TeamTemplateRecord[]) : [];
  } catch {
    return [];
  }
}

export class TeamModule {
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly waitingReported = new Set<string>();

  constructor(private readonly deps: TeamModuleDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? (() => crypto.randomUUID());
  }

  get(leadSessionId: string) {
    validateSessionId(leadSessionId);
    return this.deps.repository.getByLead(leadSessionId);
  }

  findForSession(sessionId: string) {
    return this.deps.repository.findBySession(sessionId);
  }

  async teamIdForSession(sessionId: string) {
    return (await this.findForSession(sessionId))?.team.id ?? null;
  }

  async peerScope(sessionId: string): Promise<ReadonlySet<string> | null> {
    const snapshot = await this.findForSession(sessionId);
    if (!snapshot || snapshot.team.leadSessionId === sessionId) return null;
    return new Set([
      snapshot.team.leadSessionId,
      ...snapshot.members.map((member) => member.sessionId),
    ]);
  }

  async spawn(
    leadSessionId: string,
    payload: SpawnTeammatePayload,
  ): Promise<TeamMemberRecord> {
    validateSessionId(leadSessionId);
    const lead = await this.deps.getSession(leadSessionId);
    if (!lead || lead.archivedAt) throw new TeamError("lead_not_found");
    if ((lead.sessionKind ?? "main") !== "main") {
      throw new TeamError("lead_not_main");
    }
    if (!supportsAgentTeam(lead.agentType)) {
      throw new TeamError("unsupported_agent");
    }
    const existing = await this.deps.repository.getByLead(leadSessionId);
    const verdict = canSpawnTeammate(
      existing?.team ?? null,
      existing?.members ?? [],
      payload,
    );
    if (!verdict.ok) throw new TeamError(verdict.reason);

    const now = this.now();
    const team = existing?.team ?? (await this.createTeam(lead, now));
    const role = payload.agentRoleId
      ? await this.deps.getAgentRole(payload.agentRoleId)
      : null;
    const agentType = role?.agentId ?? payload.agentType ?? lead.agentType;
    if (!supportsAgentTeam(agentType)) {
      throw new TeamError("unsupported_agent");
    }
    const worktreePath =
      payload.isolateWorktree && this.deps.createWorktree
        ? (
            await this.deps.createWorktree({
              workspaceId: lead.workspaceId,
              branch: `team/${payload.name}-${this.createId().slice(0, 8)}`,
            })
          ).path
        : null;
    const session: SessionRecord = {
      id: this.createId(),
      workspaceId: lead.workspaceId,
      title: payload.title?.trim() || payload.name,
      agentType,
      sessionKind: "teammate",
      parentSessionId: lead.id,
      parentToolCallId: null,
      status: "idle",
      writeMode: lead.writeMode,
      sessionModeId: role?.sessionModeId ?? null,
      permissionMode: role?.permissionMode ?? lead.permissionMode,
      agentRoleId: role?.id ?? null,
      providerSnapshot:
        agentType === lead.agentType ? (lead.providerSnapshot ?? null) : null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
      worktreePath,
    };
    await this.deps.saveSession(session);
    const member: TeamMemberRecord = {
      teamId: team.id,
      sessionId: session.id,
      name: payload.name,
      agentRoleId: role?.id ?? null,
      status: "spawning",
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.saveMember(member);
    this.changed(team);
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      content: renderTeammateBriefing({
        name: payload.name,
        leadSessionId: lead.id,
        prompt: payload.prompt,
      }),
      delivery: "start-new-run",
      origin: { kind: "peer", sessionId: lead.id, sessionTitle: lead.title },
    });
    return member;
  }

  async stopMember(teamId: string, sessionId: string) {
    const snapshot = await this.requireTeam(teamId);
    const member = snapshot.members.find(
      (item) => item.sessionId === sessionId,
    );
    if (!member) throw new TeamError("member_not_found");
    const stopped = await this.stopOne(member);
    this.changed(snapshot.team);
    return stopped;
  }

  async stopLeadMember(
    leadSessionId: string,
    sessionId: string,
    { force = false } = {},
  ) {
    const snapshot = await this.requireLeadTeam(leadSessionId);
    if (!force) {
      this.assertMembersIdle(
        snapshot.members.filter((member) => member.sessionId === sessionId),
      );
    }
    return this.stopMember(snapshot.team.id, sessionId);
  }

  async stopLeadTeam(leadSessionId: string, { force = false } = {}) {
    const snapshot = await this.requireLeadTeam(leadSessionId);
    if (!force) this.assertMembersIdle(snapshot.members);
    return this.stop(snapshot.team.id);
  }

  private assertMembersIdle(members: TeamMemberRecord[]) {
    const busy = members.filter(
      (member) =>
        member.status !== "stopped" &&
        this.deps.isSessionBusy(member.sessionId),
    );
    if (busy.length === 0) return;
    const names = busy.map((member) => member.name).join(", ");
    throw new TeamError(
      "members_busy",
      `Teammates still working or holding unread messages: ${names}. End your turn instead; each teammate's report wakes you when it finishes. Pass force: true only to interrupt them and discard their unread messages.`,
    );
  }

  async stop(teamId: string) {
    const snapshot = await this.requireTeam(teamId);
    for (const member of snapshot.members) {
      await this.stopOne(member);
    }
    const team: TeamRecord = {
      ...snapshot.team,
      status: "stopped",
      updatedAt: this.now(),
    };
    await this.deps.repository.saveTeam(team);
    this.changed(team);
    return team;
  }

  async onLeadStopped(leadSessionId: string) {
    const snapshot = await this.deps.repository.getByLead(leadSessionId);
    if (snapshot && snapshot.team.status === "active") {
      await this.stop(snapshot.team.id);
    }
  }

  async onAgentEvent(event: AgentEvent) {
    const waitingOn = userWaitSummary(event);
    if (waitingOn !== null) {
      await this.reportWaiting(event.sessionId, waitingOn);
      return;
    }
    const memberEvent =
      event.type === "turn.completed"
        ? { type: "turn.completed" as const }
        : event.type === "state.changed"
          ? teamMemberEventFromSessionStatus(event.status)
          : null;
    if (!memberEvent) return;
    const snapshot = await this.deps.repository.findBySession(event.sessionId);
    const member = snapshot?.members.find(
      (item) => item.sessionId === event.sessionId,
    );
    if (!snapshot || !member || member.status === "stopped") return;
    this.waitingReported.delete(member.sessionId);
    const next = transitionTeamMember(member, memberEvent, this.now());
    if (next === member) return;
    await this.deps.repository.saveMember(next);
    this.changed(snapshot.team);
    if (memberEvent.type === "turn.completed") {
      const message =
        event.type === "turn.completed"
          ? await this.deps.getMessage(event.messageId)
          : null;
      await this.report(snapshot.team, member, "finished", message?.content);
    } else if (memberEvent.type === "turn.failed") {
      await this.report(snapshot.team, member, "failed");
    }
  }

  async taskCreate(sessionId: string, input: TeamTaskCreateInput) {
    const team = await this.teamForTaskCreate(sessionId);
    const blockedBy = [...new Set(input.blockedBy ?? [])];
    if (blockedBy.length > 0) {
      const tasks = await this.deps.repository.listTasks(team.id);
      const known = new Set(tasks.map((task) => task.id));
      if (blockedBy.some((id) => !known.has(id))) {
        throw new TeamError("TASK_NOT_FOUND");
      }
    }
    const now = this.now();
    const task: TeamTaskRecord = {
      id: this.createId(),
      teamId: team.id,
      title: input.title,
      description: input.description ?? null,
      status: "backlog",
      assigneeSessionId: null,
      blockedBy,
      evidence: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.insertTask(task);
    return this.describeTask(team, task.id);
  }

  async taskList(sessionId: string) {
    const snapshot = await this.findForSession(sessionId);
    if (!snapshot) return [];
    return summarizeTasks(
      await this.deps.repository.listTasks(snapshot.team.id),
    );
  }

  async taskUpdate(sessionId: string, input: TeamTaskUpdateInput) {
    const snapshot = await this.requireTeamForSession(sessionId);
    if (input.status !== undefined && !isTeamTaskStatus(input.status)) {
      throw new TeamError("invalid_status");
    }
    const tasks = await this.deps.repository.listTasks(snapshot.team.id);
    const current = tasks.find((task) => task.id === input.taskId);
    if (!current) throw new TeamError("TASK_NOT_FOUND");
    if (
      input.assignee === "me" &&
      current.assigneeSessionId &&
      current.assigneeSessionId !== sessionId
    ) {
      throw new TeamError("TASK_CONFLICT");
    }
    const blockerIds = new Set(current.blockedBy);
    const verdict = checkTeamTaskUpdate({
      task: current,
      blockers: tasks.filter((task) => blockerIds.has(task.id)),
      callerSessionId: sessionId,
      update: input,
    });
    if (!verdict.ok) throw new TeamError(verdict.reason);
    const next: TeamTaskRecord = {
      ...current,
      status: input.status ?? current.status,
      assigneeSessionId: nextAssignee(current, input.assignee, sessionId),
      evidence:
        input.status === "review"
          ? (input.evidence?.trim() ?? null)
          : current.evidence,
      updatedAt: this.now(),
    };
    const saved = await this.deps.repository.updateTask(next, current.revision);
    if (!saved) throw new TeamError("TASK_CONFLICT");
    return this.describeTask(snapshot.team, current.id);
  }

  private async describeTask(team: TeamRecord, taskId: string) {
    const task = summarizeTasks(
      await this.deps.repository.listTasks(team.id),
    ).find((item) => item.id === taskId);
    if (!task) throw new TeamError("TASK_NOT_FOUND");
    return task;
  }

  async listRoles() {
    return (await this.deps.listAgentRoles())
      .filter((role) => supportsAgentTeam(role.agentId))
      .map(summarizeRole);
  }

  async listTemplates() {
    return parseTemplates(
      await this.deps.getSetting(TEAM_TEMPLATES_SETTING_KEY),
    );
  }

  async saveTemplate(payload: SaveTeamTemplatePayload) {
    const name = payload.name.trim();
    const members = payload.members.map((member) => ({
      name: member.name.trim(),
      agentRoleId: member.agentRoleId || null,
      prompt: member.prompt,
    }));
    const names = new Set(members.map((member) => member.name));
    if (
      !name ||
      members.length === 0 ||
      members.length > TEAM_MAX_MEMBERS ||
      names.size !== members.length ||
      members.some((member) => !TEAM_NAME_PATTERN.test(member.name))
    ) {
      throw new TeamError("invalid_template");
    }
    for (const member of members) {
      const role = member.agentRoleId
        ? await this.deps.getAgentRole(member.agentRoleId)
        : null;
      if (role && !supportsAgentTeam(role.agentId)) {
        throw new TeamError("unsupported_agent");
      }
    }
    const templates = await this.listTemplates();
    const now = this.now();
    const existing = templates.find((item) => item.id === payload.id);
    const record: TeamTemplateRecord = {
      id: existing?.id ?? this.createId(),
      name,
      members,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? templates.map((item) => (item.id === record.id ? record : item))
      : [...templates, record];
    await this.deps.setSetting(
      TEAM_TEMPLATES_SETTING_KEY,
      JSON.stringify(next),
    );
    return record;
  }

  async deleteTemplate(id: string) {
    const templates = await this.listTemplates();
    await this.deps.setSetting(
      TEAM_TEMPLATES_SETTING_KEY,
      JSON.stringify(templates.filter((item) => item.id !== id)),
    );
  }

  async spawnTemplate(
    leadSessionId: string,
    payload: SpawnTeamTemplatePayload,
  ) {
    const template = (await this.listTemplates()).find(
      (item) => item.id === payload.templateId,
    );
    if (!template) throw new TeamError("template_not_found");
    for (const member of template.members) {
      const role = member.agentRoleId
        ? await this.deps.getAgentRole(member.agentRoleId)
        : null;
      if (role && !supportsAgentTeam(role.agentId)) {
        throw new TeamError("unsupported_agent");
      }
    }
    const members: TeamMemberRecord[] = [];
    for (const member of template.members) {
      members.push(
        await this.spawn(leadSessionId, {
          name: member.name,
          agentRoleId: member.agentRoleId,
          prompt: payload.prompt
            ? `${member.prompt}\n\n${payload.prompt}`
            : member.prompt,
        }),
      );
    }
    return members;
  }

  private async createTeam(lead: SessionRecord, now: string) {
    const team: TeamRecord = {
      id: this.createId(),
      leadSessionId: lead.id,
      workspaceId: lead.workspaceId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.saveTeam(team);
    return team;
  }

  private async stopOne(member: TeamMemberRecord) {
    if (member.status === "stopped") return member;
    await this.deps.stopSession(member.sessionId);
    const stopped = transitionTeamMember(
      member,
      { type: "stopped" },
      this.now(),
    );
    await this.deps.repository.saveMember(stopped);
    return stopped;
  }

  private async reportWaiting(sessionId: string, summary: string) {
    if (this.waitingReported.has(sessionId)) return;
    const snapshot = await this.deps.repository.findBySession(sessionId);
    const member = snapshot?.members.find(
      (item) => item.sessionId === sessionId,
    );
    if (!snapshot || !member || member.status === "stopped") return;
    this.waitingReported.add(sessionId);
    await this.report(snapshot.team, member, "waiting", summary);
  }

  private async report(
    team: TeamRecord,
    member: TeamMemberRecord,
    outcome: TeammateReportOutcome,
    content = "",
  ) {
    await this.deps.sendPeerMessage(
      {
        fromSessionId: member.sessionId,
        toSessionId: team.leadSessionId,
        content,
      },
      (_origin, text) =>
        renderTeammateReport({ name: member.name, outcome }, text),
    );
  }

  private async requireTeam(teamId: string): Promise<TeamSnapshot> {
    const snapshot = await this.deps.repository.getById(teamId);
    if (!snapshot) throw new TeamError("team_not_found");
    return snapshot;
  }

  private async teamForTaskCreate(sessionId: string) {
    const snapshot = await this.findForSession(sessionId);
    if (snapshot) return snapshot.team;
    const lead = await this.deps.getSession(sessionId);
    if (!lead || lead.archivedAt || (lead.sessionKind ?? "main") !== "main") {
      throw new TeamError("team_not_found");
    }
    return this.createTeam(lead, this.now());
  }

  private async requireLeadTeam(leadSessionId: string) {
    const snapshot = await this.deps.repository.getByLead(leadSessionId);
    if (!snapshot) throw new TeamError("team_not_found");
    return snapshot;
  }

  private async requireTeamForSession(sessionId: string) {
    const snapshot = await this.findForSession(sessionId);
    if (!snapshot) throw new TeamError("team_not_found");
    return snapshot;
  }

  private changed(team: TeamRecord) {
    this.deps.broadcast({
      type: "team.changed",
      teamId: team.id,
      leadSessionId: team.leadSessionId,
    });
  }
}

function userWaitSummary(event: AgentEvent) {
  if (event.type === "permission.requested") return event.request.title;
  if (event.type === "question.requested") return event.question.question;
  return null;
}

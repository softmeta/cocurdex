import crypto from "node:crypto";
import type { DelegationRepository, DelegationRow } from "@cocurdex/db";
import {
  type AgentEvent,
  type AgentRoleRecord,
  type DelegatedWorkRecord,
  type DelegatedWorkWaitingFor,
  type DelegationCatalog,
  type DelegationCatalogQuery,
  decideRequesterReport,
  delegatedWorkOutcome,
  delegatedWorkReportMessageId,
  type MessageOrigin,
  type MessageRecord,
  type RunRecord,
  type RunStatus,
  renderDelegatedWorkBriefing,
  renderDelegatedWorkReport,
  type SendDelegatedWorkPayload,
  type SendSessionCommand,
  type SessionRecord,
  type StartDelegatedWorkPayload,
  type TeamTemplateRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import type { RemoteWorkGateway } from "./remote-work-gateway";
import { RemoteWorkWatcher } from "./remote-work-watcher";
import {
  createWorkSession,
  followUpDelivery,
  type WorkSessionDependencies,
} from "./work-session";
import {
  buildCatalog,
  DelegationError,
  requirePrompt,
  resolveHost,
  resolveRole,
  resolveTemplate,
  resolveWorkspace,
  workState,
  workTitle,
} from "./work-targets";

export { DelegationError } from "./work-targets";

export interface DelegationPersona {
  id: string;
  name: string;
  homeSessionId: string;
}

export interface DelegationModuleDependencies extends WorkSessionDependencies {
  repository: DelegationRepository;
  getPersona(personaId: string): Promise<DelegationPersona | null>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  listRoles(): Promise<AgentRoleRecord[]>;
  listTemplates(): Promise<TeamTemplateRecord[]>;
  createTeam(input: {
    leadSessionId: string;
    templateId: string;
  }): Promise<unknown>;
  submitReport(
    command: SendSessionCommand,
    options: { hold: boolean },
  ): Promise<MessageRecord>;
  stopSession(sessionId: string): Promise<unknown>;
  latestRun(sessionId: string): RunRecord | null;
  getRunReply(sessionId: string, runId: string): Promise<MessageRecord | null>;
  getMessage(messageId: string): Promise<MessageRecord | null>;
  waitingFor(sessionId: string): DelegatedWorkWaitingFor | null;
  remote?: RemoteWorkGateway;
  remotePollIntervalMs?: number;
  track(work: Promise<unknown>): void;
  onReportFailed(error: unknown): void;
  announceChanged(): void;
  now?(): string;
}

interface FinishedTurn {
  workSessionId: string;
  title: string;
  run: { id: string; status: RunStatus; error: string | null };
  reply: string | null;
  origin: MessageOrigin;
}

const LIST_LIMIT = 50;
const LIST_REFRESH_WAIT_MS = 3_000;

export class DelegationModule {
  private reports: Promise<void> = Promise.resolve();
  private readonly watcher: RemoteWorkWatcher | null;

  constructor(private readonly deps: DelegationModuleDependencies) {
    const remote = deps.remote;
    this.watcher = remote
      ? new RemoteWorkWatcher({
          rows: () => deps.repository.listRemote(),
          fetch: (hostId, sessionIds) => remote.status(hostId, sessionIds),
          report: (row, status) =>
            this.report(
              row,
              {
                workSessionId: row.workSessionId,
                title: status.title,
                run: status.latestRun ?? {
                  id: "",
                  status: "interrupted",
                  error: null,
                },
                reply: status.reply,
                origin: this.remoteOrigin(row, status.title),
              },
              false,
            ),
          onChanged: () => deps.announceChanged(),
          onFailed: (error) => deps.onReportFailed(error),
          intervalMs: deps.remotePollIntervalMs,
        })
      : null;
  }

  async catalog(
    query: DelegationCatalogQuery = {},
  ): Promise<DelegationCatalog> {
    const hosts = this.hosts();
    if (query.host) {
      const host = this.requireHost(query.host);
      const catalog = await this.remoteCall(host, (remote) =>
        remote.catalog(host.hostId),
      );
      return { ...catalog, hosts };
    }
    const [workspaces, roles, templates] = await Promise.all([
      this.deps.listWorkspaces(),
      this.deps.listRoles(),
      this.deps.listTemplates(),
    ]);
    return {
      ...buildCatalog(workspaces, roles, templates),
      ...(hosts.length > 0 ? { hosts } : {}),
    };
  }

  async start(
    payload: StartDelegatedWorkPayload,
  ): Promise<DelegatedWorkRecord> {
    const prompt = requirePrompt(
      payload.prompt,
      "Describe the task to delegate.",
    );
    if (payload.agentRole && payload.teamTemplate) {
      throw new DelegationError(
        "role_and_template",
        "Pass either an agent role or a team template, not both.",
      );
    }
    const persona = await this.requirePersona(payload.personaId);
    if (payload.host) return this.startRemote(payload, persona, prompt);
    const workspace = resolveWorkspace(
      await this.deps.listWorkspaces(),
      payload.workspace,
    );
    const role = payload.agentRole
      ? resolveRole(await this.deps.listRoles(), payload.agentRole)
      : null;
    const template = payload.teamTemplate
      ? resolveTemplate(await this.deps.listTemplates(), payload.teamTemplate)
      : null;
    const session = await createWorkSession(this.deps, {
      workspaceId: workspace.id,
      agentRoleId: role?.id ?? template?.members[0]?.agentRoleId ?? null,
      title: workTitle(prompt, payload.title),
      isolateWorktree: payload.isolateWorktree === true,
    });
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
      remote: null,
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
    await this.refreshRemote();
    const workspaces = await this.deps.listWorkspaces();
    const records: DelegatedWorkRecord[] = [];
    for (const row of this.deps.repository.listByPersona(
      personaId,
      LIST_LIMIT,
    )) {
      if (row.remote) {
        records.push(this.describeRemote(row));
        continue;
      }
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
    const message = requirePrompt(payload.message, "The message is empty.");
    const row = this.requireRow(payload);
    const persona = await this.requirePersona(payload.personaId);
    if (row.remote) {
      const host = this.requireHost(row.remote.hostId);
      const status = await this.remoteCall(host, (remote) =>
        remote.send(host.hostId, {
          sessionId: row.workSessionId,
          message,
          requesterName: persona.name,
        }),
      );
      this.watcher?.remember(status);
      return this.describeRemote(row);
    }
    const session = await this.requireSession(row);
    await this.deps.sendSessionMessage({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      content: renderDelegatedWorkBriefing(persona.name, message),
      delivery: await followUpDelivery(this.deps, session),
      origin: this.personaOrigin(persona),
    });
    return this.describe(row, session, await this.deps.listWorkspaces());
  }

  async stop(target: {
    personaId: string;
    sessionId: string;
  }): Promise<DelegatedWorkRecord> {
    const row = this.requireRow(target);
    if (row.remote) {
      const host = this.requireHost(row.remote.hostId);
      const status = await this.remoteCall(host, (remote) =>
        remote.stop(host.hostId, { sessionId: row.workSessionId }),
      );
      this.watcher?.remember(status);
      return this.describeRemote(row);
    }
    await this.deps.stopSession(target.sessionId);
    const session = await this.requireSession(row);
    return this.describe(row, session, await this.deps.listWorkspaces());
  }

  forgetPersona(personaId: string) {
    this.deps.repository.deleteByPersona(personaId);
  }

  forgetHost(hostId: string) {
    this.deps.repository.deleteByRemoteHost(hostId);
    this.watcher?.forgetHost(hostId);
  }

  async onAgentEvent(event: AgentEvent) {
    if (event.type !== "run.updated" || event.run.status === "running") return;
    const row = this.deps.repository.get(event.sessionId);
    if (!row || row.remote) return;
    const run = event.run;
    this.enqueue(async () => {
      const turn = await this.localTurn(row, run);
      if (turn) await this.report(row, turn, false);
    });
  }

  async recoverReports() {
    for (const row of this.deps.repository.list()) {
      if (row.remote) continue;
      const run = this.deps.latestRun(row.workSessionId);
      if (!run || run.status === "running") continue;
      const turn = await this.localTurn(row, run).catch(() => null);
      if (turn) await this.report(row, turn, true).catch(() => undefined);
    }
    this.watcher?.start();
  }

  pollRemote() {
    return this.watcher?.poll({ force: true }) ?? Promise.resolve();
  }

  private async refreshRemote() {
    if (!this.watcher) return;
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LIST_REFRESH_WAIT_MS);
    });
    await Promise.race([this.watcher.poll({ force: true }), waited]);
    clearTimeout(timer);
  }

  async dispose() {
    await this.watcher?.dispose();
  }

  private async startRemote(
    payload: StartDelegatedWorkPayload,
    persona: DelegationPersona,
    prompt: string,
  ) {
    if (payload.teamTemplate) {
      throw new DelegationError(
        "remote_team",
        "Team templates run only on this computer; pick an agent role for a paired computer.",
      );
    }
    const host = this.requireHost(payload.host ?? "");
    const started = await this.remoteCall(host, (remote) =>
      remote.start(host.hostId, {
        workspace: payload.workspace,
        prompt,
        requesterName: persona.name,
        title: payload.title,
        agentRole: payload.agentRole,
        isolateWorktree: payload.isolateWorktree === true,
      }),
    );
    const { sessionId, ...snapshot } = started;
    const row: DelegationRow = {
      workSessionId: sessionId,
      personaId: persona.id,
      requesterSessionId: persona.homeSessionId,
      teamTemplateId: null,
      createdAt: this.now(),
      remote: { ...snapshot, hostId: host.hostId, hostName: host.name },
    };
    this.deps.repository.insert(row);
    this.watcher?.remember({
      sessionId,
      title: started.title,
      state: "running",
      waitingFor: null,
      updatedAt: row.createdAt,
      latestRun: null,
      reply: null,
    });
    this.deps.announceChanged();
    return this.describeRemote(row);
  }

  private enqueue(work: () => Promise<void>) {
    const next = this.reports
      .then(work)
      .catch((error: unknown) => this.deps.onReportFailed(error));
    this.reports = next;
    this.deps.track(next);
  }

  private async localTurn(
    row: DelegationRow,
    run: RunRecord,
  ): Promise<FinishedTurn | null> {
    const work = await this.deps.getSession(row.workSessionId);
    if (!work) return null;
    const reply = await this.deps.getRunReply(work.id, run.id);
    return {
      workSessionId: work.id,
      title: work.title,
      run: { id: run.id, status: run.status, error: run.error ?? null },
      reply: reply?.content ?? null,
      origin: { kind: "peer", sessionId: work.id, sessionTitle: work.title },
    };
  }

  private async report(
    row: DelegationRow,
    turn: FinishedTurn,
    recovering: boolean,
  ) {
    if (!turn.run.id) return;
    const messageId = delegatedWorkReportMessageId(turn.run.id);
    if (await this.deps.getMessage(messageId)) return;
    const home = await this.deps.getSession(row.requesterSessionId);
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
    await this.deps.submitReport(
      {
        sessionId: row.requesterSessionId,
        messageId,
        content: renderDelegatedWorkReport({
          title: turn.title,
          outcome: delegatedWorkOutcome(turn.run.status),
          error: turn.run.error,
          reply: turn.reply,
        }),
        delivery:
          decision.delivery === "hold" ? "queue-after-run" : decision.delivery,
        origin: turn.origin,
      },
      { hold: decision.delivery === "hold" },
    );
  }

  private hosts() {
    return (this.deps.remote?.hosts() ?? []).map((host) => ({
      id: host.hostId,
      name: host.name,
      status: host.status,
    }));
  }

  private requireHost(query: string) {
    if (!this.deps.remote) {
      throw new DelegationError(
        "host_not_found",
        "This computer cannot reach paired computers.",
      );
    }
    return resolveHost(this.deps.remote.hosts(), query);
  }

  private async remoteCall<T>(
    host: { hostId: string; name: string },
    call: (remote: RemoteWorkGateway) => Promise<T>,
  ) {
    const remote = this.deps.remote;
    if (!remote) throw this.workNotFound();
    try {
      return await call(remote);
    } catch (error) {
      if (!remote.isUnreachable(error)) throw error;
      throw new DelegationError(
        "host_unreachable",
        `${host.name} is not reachable right now: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private personaOrigin(persona: DelegationPersona): MessageOrigin {
    return {
      kind: "peer",
      sessionId: persona.homeSessionId,
      sessionTitle: persona.name,
    };
  }

  private remoteOrigin(row: DelegationRow, title: string): MessageOrigin {
    return {
      kind: "remoteHost",
      hostName: row.remote?.hostName ?? "",
      senderName: title,
      hostId: row.remote?.hostId,
      sessionId: row.workSessionId,
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
      state: workState(
        session,
        this.deps.hasActiveRun(session.id),
        this.deps.latestRun(session.id),
      ),
      waitingFor: this.deps.waitingFor(session.id),
      host: null,
      createdAt: row.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private describeRemote(row: DelegationRow): DelegatedWorkRecord {
    const remote = row.remote;
    if (!remote) throw this.workNotFound();
    const status = this.watcher?.status(row.workSessionId) ?? null;
    const known = this.deps.remote
      ?.hosts()
      .find((host) => host.hostId === remote.hostId);
    return {
      sessionId: row.workSessionId,
      personaId: row.personaId,
      title: status?.title || remote.title,
      workspaceId: remote.workspaceId,
      workspaceName: remote.workspaceName,
      agentType: remote.agentType,
      agentRoleId: remote.agentRoleId,
      teamTemplateId: null,
      worktreePath: remote.worktreePath,
      state: status?.state ?? "idle",
      waitingFor: status?.waitingFor ?? null,
      host: {
        id: remote.hostId,
        name: known?.name ?? remote.hostName,
        reachable:
          Boolean(known) && !this.watcher?.isUnreachable(remote.hostId),
      },
      createdAt: row.createdAt,
      updatedAt: status?.updatedAt ?? row.createdAt,
    };
  }

  private async requirePersona(personaId: string) {
    const persona = await this.deps.getPersona(personaId);
    if (!persona) {
      throw new DelegationError("persona_not_found", "Persona was not found.");
    }
    return persona;
  }

  private requireRow(target: { personaId: string; sessionId: string }) {
    const row = this.deps.repository.get(target.sessionId);
    if (!row || row.personaId !== target.personaId) throw this.workNotFound();
    return row;
  }

  private async requireSession(row: DelegationRow) {
    const session = await this.deps.getSession(row.workSessionId);
    if (!session) throw this.workNotFound();
    return session;
  }

  private workNotFound() {
    return new DelegationError(
      "work_not_found",
      "No work session you delegated has this id.",
    );
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }
}

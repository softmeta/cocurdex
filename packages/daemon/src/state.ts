import crypto from "node:crypto";
import {
  type AgentCapabilityCacheRepository,
  createCocurdexDatabase,
  type ScriptRunRepository,
  type TeamRepository,
  type WorkflowRepository,
} from "@cocurdex/db";
import type {
  AgentDescriptor,
  AgentEvent,
  AgentId,
  AgentProviderSelection,
  AgentRoleRecord,
  AgentSessionMode,
  AgentToolCallRecord,
  AgentUsageUpdatedEvent,
  AppBootstrapData,
  EditorViewRecord,
  MessageRecord,
  PendingSettingsChangeRecord,
  ProviderConfigRecord,
  ProviderModelRecord,
  QueuedAgentInputRecord,
  SessionMessagesResult,
  SessionRecord,
  SessionStatus,
  WorkspaceRecord,
  WorkspaceWorktreeEnvironment,
  WorktreeEnvironmentProposal,
} from "@cocurdex/shared";
import {
  childSessionFromSubagentToolCall,
  getContextUsageTokens,
  loadNetworkProxySettingsFromJson,
  mergeProjectedSubagentSession,
  mergeUsageRecords,
  NETWORK_PROXY_SETTING_KEY,
} from "@cocurdex/shared";
import { SessionAttentionProjection } from "./attention";
import { logDaemonDiagnostic } from "./diagnostics";
import { createMessageDeltaBuffer } from "./message-delta-buffer";
import { getDatabasePath } from "./paths";
import { withMessageSeq, withTimelineSeq } from "./timeline-seq-event";
import { capToolCallOutput, withoutToolCallOutput } from "./tool-call-output";

type CocurdexDatabase = ReturnType<typeof createCocurdexDatabase>;
const TERMINAL_STATUSES = new Set<SessionStatus>(["idle", "error", "exited"]);
const INTERRUPTED_BY_RESTART_MESSAGE =
  "The agent was interrupted because Cocurdex restarted before this turn finished. Send a message to continue.";

export class DaemonState {
  readonly sessionAttention: SessionAttentionProjection;
  readonly workflows: WorkflowRepository;
  readonly teams: TeamRepository;
  readonly scriptRuns: ScriptRunRepository;
  readonly agentCapabilityCache: AgentCapabilityCacheRepository;
  private closed = false;
  private readonly agentVersions = new Map<AgentId, string>();
  private readonly database: CocurdexDatabase;
  private readonly deltaBuffer = createMessageDeltaBuffer();
  private networkProxyReady: Promise<void>;
  private staleToolCallsSwept: Promise<void>;
  private staleSessionsSwept: Promise<void>;

  constructor(userDataPath: string) {
    this.database = createCocurdexDatabase(getDatabasePath(userDataPath));
    this.workflows = this.database.workflows;
    this.teams = this.database.teams;
    this.scriptRuns = this.database.scriptRuns;
    this.agentCapabilityCache = this.database.agentCapabilityCache;
    this.sessionAttention = new SessionAttentionProjection(
      this.database.sessionAttention,
      this.database.sessions,
    );
    // Capture shell-inherited proxy env, then overlay the app setting so agent
    // spawns and daemon fetch see a consistent policy for this process.
    this.networkProxyReady = this.loadAndApplyNetworkProxy();
    // Runs once per daemon process, before any agent can start a turn: at this
    // point a non-terminal tool call can only be debris from a previous run.
    this.staleSessionsSwept = this.failInterruptedSessions();
    this.staleToolCallsSwept = this.database.toolCalls.failNonTerminal();
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.database.close();
  }

  async getDatabase() {
    await this.networkProxyReady;
    return this.database;
  }

  async waitForStartupRecovery(): Promise<void> {
    await Promise.all([
      this.networkProxyReady,
      this.staleToolCallsSwept,
      this.staleSessionsSwept,
    ]);
  }

  async bootstrap(): Promise<AppBootstrapData> {
    await this.waitForStartupRecovery();

    const queuedAgentInputs = await this.database.queuedAgentInputs.list();
    const queuedMessages = await Promise.all(
      queuedAgentInputs.map((input) =>
        this.database.messages.getById(input.messageId),
      ),
    );

    return {
      workspaces: await this.database.workspaces.list(),
      sessions: await this.database.sessions.list(),
      queuedMessages: queuedMessages.filter(
        (message): message is MessageRecord => message != null,
      ),
      queuedAgentInputs,
      sessionUsage: await this.database.sessionUsage.list(),
      editorViews: await this.database.editorViews.list(),
    };
  }

  private async loadAndApplyNetworkProxy() {
    try {
      const raw = await this.database.appSettings.get(
        NETWORK_PROXY_SETTING_KEY,
      );
      loadNetworkProxySettingsFromJson(raw, process.env);
    } catch (error) {
      logDaemonDiagnostic("warn", "networkProxy.loadFailed", {
        error: error instanceof Error ? error.message : String(error),
      });
      loadNetworkProxySettingsFromJson(null, process.env);
    }
  }

  listWorkspaces() {
    return this.database.workspaces.list();
  }

  async saveWorkspace(workspace: WorkspaceRecord) {
    await this.database.workspaces.upsert(workspace);
  }

  getWorktreeEnvironment(workspaceId: string) {
    return this.database.worktreeEnvironments.getByWorkspaceId(workspaceId);
  }

  saveWorktreeEnvironment(environment: WorkspaceWorktreeEnvironment) {
    return this.database.worktreeEnvironments.upsert(environment);
  }

  saveWorktreeEnvironmentProposal(
    workspaceId: string,
    proposal: WorktreeEnvironmentProposal,
  ) {
    return this.database.worktreeEnvironments.saveProposal(
      workspaceId,
      proposal,
    );
  }

  listPendingSettingsChanges() {
    return this.database.pendingSettingsChanges.list();
  }

  addPendingSettingsChange(change: PendingSettingsChangeRecord) {
    return this.database.pendingSettingsChanges.add(change);
  }

  deletePendingSettingsChange(id: string) {
    return this.database.pendingSettingsChanges.delete(id);
  }

  getAppSetting(key: string) {
    return this.database.appSettings.get(key);
  }

  setAppSetting(key: string, valueJson: string) {
    return this.database.appSettings.set(key, valueJson);
  }

  deleteWorkspace(workspaceId: string) {
    return this.database.workspaces.delete(workspaceId);
  }

  async listSessionMessages(sessionId: string): Promise<SessionMessagesResult> {
    const [messages, turnStats, turnChangeSets] = await Promise.all([
      this.database.messages.listBySessionId(sessionId),
      this.database.messageTurnStats.listBySessionId(sessionId),
      this.database.turnChangeSets.listBySessionId(sessionId),
    ]);
    return { messages, turnStats, turnChangeSets };
  }

  listToolCallSummaries(sessionId: string): Promise<AgentToolCallRecord[]> {
    return this.database.toolCalls.listSummariesBySessionId(sessionId);
  }

  async getNetworkProxySettingJson() {
    await this.networkProxyReady;
    return this.database.appSettings.get(NETWORK_PROXY_SETTING_KEY);
  }

  async setNetworkProxySettingJson(valueJson: string) {
    await this.networkProxyReady;
    await this.database.appSettings.set(NETWORK_PROXY_SETTING_KEY, valueJson);
    loadNetworkProxySettingsFromJson(valueJson, process.env);
  }

  get data() {
    return {
      issues: this.database.issues,
      notes: this.database.notes,
      search: this.database.search,
    };
  }

  listSessions() {
    return this.database.sessions.list();
  }

  listArchivedSessions() {
    return this.database.sessions.listArchived();
  }

  async saveSession(session: SessionRecord) {
    await this.database.sessions.upsert(session);
  }

  archiveSession(sessionId: string, archivedAt?: string) {
    return this.database.sessions.archive(sessionId, archivedAt);
  }

  async deleteSession(sessionId: string) {
    await this.database.turnChangeSets.deleteBySessionId(sessionId);
    await this.database.sessions.delete(sessionId);
  }

  get turnChangeSets() {
    return this.database.turnChangeSets;
  }

  listTurnChangeSets(sessionId: string) {
    return this.database.turnChangeSets.listBySessionId(sessionId);
  }

  getSession(sessionId: string) {
    return this.database.sessions.getById(sessionId);
  }

  async updateSessionTitle(
    sessionId: string,
    title: string,
    options: { expectedTitle?: string | null; updatedAt?: string } = {},
  ) {
    return this.database.sessions.updateTitle(
      sessionId,
      title,
      options.updatedAt,
      options.expectedTitle,
    );
  }

  listMessagesBySessionId(sessionId: string) {
    return this.database.messages.listBySessionId(sessionId);
  }

  listToolCallsBySessionId(sessionId: string) {
    return this.database.toolCalls.listBySessionId(sessionId);
  }

  listActiveMessagesBySessionId(sessionId: string) {
    return this.deltaBuffer.list(sessionId);
  }

  async getSessionUsage(sessionId: string) {
    return (await this.database.sessionUsage.list())[sessionId] ?? null;
  }

  getMessageById(messageId: string) {
    return this.database.messages.getById(messageId);
  }

  async saveEditorView(view: EditorViewRecord) {
    await this.database.editorViews.upsert(view);
  }

  async saveUserMessage(message: MessageRecord): Promise<MessageRecord> {
    const session = await this.database.sessions.getById(message.sessionId);
    let stored: Promise<number | null> = Promise.resolve(null);
    this.database.transaction(() => {
      stored = this.database.messages.append(message);
      if (session) {
        void this.database.sessions.upsert({
          ...session,
          updatedAt: message.createdAt,
          lastMessageAt: message.createdAt,
        });
      }
    });
    return withMessageSeq(message, await stored);
  }

  moveMessageToEnd(messageId: string, sessionId: string) {
    return this.database.messages.moveToEnd(messageId, sessionId);
  }

  async saveQueuedUserMessage(
    message: MessageRecord,
    input: QueuedAgentInputRecord,
  ): Promise<MessageRecord> {
    const session = await this.database.sessions.getById(message.sessionId);
    let stored: Promise<number | null> = Promise.resolve(null);
    this.database.transaction(() => {
      stored = this.database.messages.append(message);
      void this.database.queuedAgentInputs.enqueue(input);
      if (session) {
        void this.database.sessions.upsert({
          ...session,
          updatedAt: message.createdAt,
          lastMessageAt: message.createdAt,
        });
      }
    });
    return withMessageSeq(message, await stored);
  }

  restoreSession(sessionId: string) {
    return this.database.sessions.restore(sessionId);
  }

  setProviderApiKeySecretId(providerId: string, secretId: string | null) {
    return this.database.providerConfigs.setApiKeySecretId(
      providerId,
      secretId,
    );
  }

  listQueuedAgentInputs(sessionId: string) {
    return this.database.queuedAgentInputs.listBySessionId(sessionId);
  }

  enqueueQueuedAgentInput(input: QueuedAgentInputRecord) {
    return this.database.queuedAgentInputs.enqueue(input);
  }

  deleteQueuedAgentInput(messageId: string) {
    return this.database.queuedAgentInputs.delete(messageId);
  }

  async updateQueuedUserMessage(message: MessageRecord) {
    await this.database.messages.update(message);
  }

  async deleteQueuedUserMessage(messageId: string) {
    const message = await this.database.messages.getById(messageId);
    this.database.transaction(() => {
      void this.database.queuedAgentInputs.delete(messageId);
      void this.database.messages.delete(messageId);
    });
    if (!message) return;

    const [session, remainingMessages] = await Promise.all([
      this.database.sessions.getById(message.sessionId),
      this.database.messages.listBySessionId(message.sessionId),
    ]);
    if (!session) return;

    await this.database.sessions.upsert({
      ...session,
      updatedAt: new Date().toISOString(),
      lastMessageAt: remainingMessages.at(-1)?.createdAt ?? null,
    });
  }

  async rewindSessionMessages(
    message: MessageRecord,
    { keepProviderSession = false } = {},
  ) {
    const session = await this.database.sessions.getById(message.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    this.database.transaction(() => {
      void this.database.toolCalls.deleteAfter(message.sessionId, message.id);
      void this.database.messages.deleteAfter(message.sessionId, message.id);
      void this.database.messages.update(message);
      if (!keepProviderSession)
        void this.database.providerSessions.clear(message.sessionId);
      void this.database.sessions.upsert({
        ...session,
        status: "idle",
        updatedAt: message.createdAt,
        lastMessageAt: message.createdAt,
      });
    });
  }

  getProviderSession(sessionId: string) {
    return this.database.providerSessions.getBySessionId(sessionId);
  }

  async saveProviderSession(
    sessionId: string,
    providerSessionId: string | null,
    providerState: Record<string, unknown>,
    resumable: boolean,
    providerVersion: string | null = null,
  ) {
    await this.database.providerSessions.upsert({
      sessionId,
      providerSessionId,
      providerStateJson: JSON.stringify(providerState),
      providerVersion,
      resumable,
      updatedAt: new Date().toISOString(),
    });
  }

  async clearProviderSession(sessionId: string) {
    await this.database.providerSessions.clear(sessionId);
  }

  listProviderConfigs() {
    return this.database.providerConfigs.list();
  }

  getProviderConfig(providerId: string) {
    return this.database.providerConfigs.getById(providerId);
  }

  async saveProviderConfig(config: ProviderConfigRecord) {
    await this.database.providerConfigs.upsert(config);
  }

  async deleteProviderConfig(providerId: string) {
    await this.database.providerConfigs.delete(providerId);
  }

  listProviderModels(providerId?: string) {
    return this.database.providerModels.list(providerId);
  }

  getProviderModel(providerId: string, modelId: string) {
    return this.database.providerModels.get(providerId, modelId);
  }

  recordAgentVersions(agents: AgentDescriptor[]) {
    for (const agent of agents) {
      const version = agent.installation?.version;
      if (version) {
        this.agentVersions.set(agent.id, version);
      } else {
        this.agentVersions.delete(agent.id);
      }
    }
  }

  async cacheSessionModes(sessionId: string, modes: AgentSessionMode[]) {
    const session = await this.database.sessions.getById(sessionId);
    const version = session
      ? this.agentVersions.get(session.agentType)
      : undefined;
    if (!session || !version) {
      return;
    }

    const existing = await this.agentCapabilityCache.get(
      session.agentType,
      version,
    );
    await this.agentCapabilityCache.set(session.agentType, version, {
      capabilities: { ...existing?.capabilities, sessionModes: modes },
      probedAt: new Date().toISOString(),
    });
  }

  async saveProviderModel(model: ProviderModelRecord) {
    await this.database.providerModels.upsert(model);
  }

  async deleteProviderModel(providerId: string, modelId: string) {
    await this.database.providerModels.delete(providerId, modelId);
  }

  async deleteProviderModelsByProvider(providerId: string) {
    await this.database.providerModels.deleteByProvider(providerId);
  }

  listAgentProviderDefaults() {
    return this.database.agentProviderDefaults.list();
  }

  getAgentProviderDefault(agentId: AgentId) {
    return this.database.agentProviderDefaults.getByAgentId(agentId);
  }

  async saveAgentProviderDefault(selection: AgentProviderSelection) {
    await this.database.agentProviderDefaults.upsert(selection);
  }

  listAgentRoles() {
    return this.database.agentRoles.list();
  }

  getAgentRole(id: string) {
    return this.database.agentRoles.getById(id);
  }

  async saveAgentRole(role: AgentRoleRecord) {
    await this.database.agentRoles.upsert(role);
  }

  async deleteAgentRole(id: string) {
    await this.database.agentRoles.delete(id);
  }

  async persistAgentEvent(event: AgentEvent): Promise<AgentEvent> {
    const eventTimestamp = new Date().toISOString();

    if (event.type === "state.changed") {
      if (TERMINAL_STATUSES.has(event.status)) {
        await this.flushBufferedMessages(event.sessionId);
      }
      await this.database.sessions.updateStatus(event.sessionId, event.status);
      return event;
    }

    if (event.type === "session.upserted") {
      await this.database.sessions.upsert(event.session);
      return event;
    }

    if (event.type === "session.title.updated") {
      await this.updateSessionTitle(event.sessionId, event.title, {
        expectedTitle: event.expectedTitle,
        updatedAt: event.updatedAt,
      });
      return event;
    }

    if (event.type === "message.completed") {
      const buffered = this.deltaBuffer.release(event.message.id);
      const seq = await this.database.messages.append({
        ...event.message,
        seq: event.message.seq ?? buffered?.seq,
      });
      const session = await this.database.sessions.getById(event.sessionId);

      if (session) {
        await this.database.sessions.upsert({
          ...session,
          status: "idle",
          updatedAt: event.message.createdAt,
          lastMessageAt: event.message.createdAt,
        });
      }
      return withTimelineSeq(event, seq);
    }

    if (event.type === "message.delta") {
      const seq = this.deltaBuffer.has(event.messageId)
        ? null
        : await this.reserveTimelineSeq(event.sessionId, event.messageId);
      return withTimelineSeq(event, this.deltaBuffer.append(event, seq).seq);
    }

    if (
      event.type === "tool.started" ||
      event.type === "tool.updated" ||
      event.type === "tool.finished"
    ) {
      const toolCall = capToolCallOutput(event.toolCall);
      const seq = await this.database.toolCalls.upsert(toolCall);
      await this.persistSubagentChildSession(toolCall);
      return withTimelineSeq(
        { ...event, toolCall: withoutToolCallOutput(toolCall) },
        seq,
      );
    }

    if (event.type === "usage.updated") {
      await this.logSessionTokenUsage(event);
      await this.database.sessionUsage.add(
        event.sessionId,
        event.usage,
        event.receivedAt,
      );
      return event;
    }

    if (event.type === "turn.completed") {
      const existingMessage = await this.database.messages.getById(
        event.messageId,
      );
      if (existingMessage) {
        await this.database.messageTurnStats.upsert(event);
      } else {
        logDaemonDiagnostic("warn", "[MessageTurnStats] Missing message", {
          durationMs: event.durationMs,
          messageId: event.messageId,
          sessionId: event.sessionId,
        });
      }
      return event;
    }

    if (event.type === "error") {
      await this.flushBufferedMessages(event.sessionId);
      const systemMessage = this.createSystemMessage(
        event.sessionId,
        event.message,
        eventTimestamp,
      );
      const seq = await this.database.messages.append(systemMessage);
      const session = await this.database.sessions.getById(event.sessionId);

      if (session) {
        await this.database.sessions.upsert({
          ...session,
          status: "error",
          updatedAt: eventTimestamp,
          lastMessageAt: eventTimestamp,
        });
      }
      return { ...event, systemMessage: withMessageSeq(systemMessage, seq) };
    }

    return event;
  }

  private async persistSubagentChildSession(toolCall: AgentToolCallRecord) {
    const parent = await this.database.sessions.getById(toolCall.sessionId);
    if (!parent) {
      return;
    }
    const child = childSessionFromSubagentToolCall(parent, toolCall);
    if (!child) {
      return;
    }
    const existing = await this.database.sessions.getById(child.id);
    await this.database.sessions.upsert(
      mergeProjectedSubagentSession(existing ?? undefined, child),
    );
  }

  private async reserveTimelineSeq(sessionId: string, messageId: string) {
    const persisted = await this.database.messages.getById(messageId);
    if (persisted) {
      return persisted.seq ?? null;
    }
    return this.database.sessions.allocateTimelineSeq(sessionId);
  }

  private async flushBufferedMessages(sessionId: string) {
    for (const message of this.deltaBuffer.drain(sessionId)) {
      await this.database.messages.append(message);
    }
  }

  private async logSessionTokenUsage(event: AgentUsageUpdatedEvent) {
    const session = await this.database.sessions.getById(event.sessionId);
    const snapshot = session?.providerSnapshot ?? null;
    const model = snapshot
      ? await this.database.providerModels.get(
          snapshot.providerId,
          snapshot.modelId,
        )
      : null;
    const inputTokens = event.usage.inputTokens;
    const cacheReadInputTokens = event.usage.cacheReadInputTokens ?? 0;
    const cacheCreationInputTokens = event.usage.cacheCreationInputTokens ?? 0;
    const outputTokens = event.usage.outputTokens;
    const queryTokens = inputTokens + outputTokens;
    const currentSessionUsage = (await this.database.sessionUsage.list())[
      event.sessionId
    ];
    const mergedUsage = mergeUsageRecords(currentSessionUsage, event.usage);
    const sessionTokens = getContextUsageTokens(mergedUsage);
    const contextLimit =
      mergedUsage.contextWindowSize ?? model?.contextLimit ?? null;
    const percent =
      sessionTokens != null && contextLimit && contextLimit > 0
        ? Math.min(100, (sessionTokens / contextLimit) * 100)
        : null;

    logDaemonDiagnostic("info", "[SessionTokenUsage]", {
      cacheCreationInputTokens,
      cacheReadInputTokens,
      contextLimit,
      contextTokensUsed: mergedUsage.contextTokensUsed ?? null,
      formula:
        mergedUsage.contextTokensUsed != null
          ? "contextTokensUsed"
          : "unavailable",
      inputTokens,
      modelId: snapshot?.modelId ?? null,
      modelName: snapshot?.modelName ?? null,
      outputTokens,
      percent,
      providerId: snapshot?.providerId ?? null,
      queryTokens,
      reasoningOutputTokens: event.usage.reasoningOutputTokens ?? 0,
      receivedAt: event.receivedAt,
      sessionCacheCreationInputTokens:
        mergedUsage.cacheCreationInputTokens ?? 0,
      sessionCacheReadInputTokens: mergedUsage.cacheReadInputTokens ?? 0,
      sessionInputTokens: mergedUsage.inputTokens,
      sessionOutputTokens: mergedUsage.outputTokens,
      sessionReasoningOutputTokens: mergedUsage.reasoningOutputTokens ?? 0,
      sessionTotalCostUsd: mergedUsage.totalCostUsd ?? null,
      sessionId: event.sessionId,
      sessionTokens,
      totalCostUsd: event.usage.totalCostUsd ?? null,
    });
  }

  private async failInterruptedSessions() {
    const sessionIds = await this.database.sessions.failRunning();
    await this.database.teams.failActiveMembers();
    const createdAt = new Date().toISOString();
    for (const sessionId of sessionIds) {
      await this.database.messages.append(
        this.createSystemMessage(
          sessionId,
          INTERRUPTED_BY_RESTART_MESSAGE,
          createdAt,
        ),
      );
    }
  }

  private createSystemMessage(
    sessionId: string,
    content: string,
    createdAt: string,
  ): MessageRecord {
    return {
      id: crypto.randomUUID(),
      sessionId,
      role: "system",
      content,
      attachments: [],
      createdAt,
    };
  }
}

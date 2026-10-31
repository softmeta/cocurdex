import crypto from "node:crypto";
import {
  type AgentCapabilityCacheRepository,
  type ContextTransferConsumption,
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
  AgentProviderSessionRecord,
  AgentRoleRecord,
  AgentSessionMode,
  AgentToolCallRecord,
  AgentUsageUpdatedEvent,
  ContextTransferRecord,
  EditorViewRecord,
  MessageRecord,
  PendingSettingsChangeRecord,
  ProviderConfigRecord,
  ProviderModelRecord,
  QueuedAgentInputRecord,
  RunRecord,
  RunStatus,
  SessionMessagesResult,
  SessionRecord,
  SessionStatus,
  StoredBootstrapData,
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
import { applyNodeGlobalProxy } from "@cocurdex/shared/node";
import { SessionAttentionProjection } from "./attention";
import { logDaemonDiagnostic } from "./diagnostics";
import { createMessageDeltaBuffer } from "./message-delta-buffer";
import { getDatabasePath } from "./paths";
import { StorageMaintenance } from "./storage-maintenance";
import { formatSyncCursor } from "./sync/sync-cursor";
import type { SyncPullSources } from "./sync/sync-pull";
import { withMessageSeq, withTimelineSeq } from "./timeline-seq-event";
import { capToolCallOutput, withoutToolCallOutput } from "./tool-call-output";
import {
  createToolOutputStore,
  type ToolOutputStore,
} from "./tool-output-store";

type CocurdexDatabase = ReturnType<typeof createCocurdexDatabase>;
const TERMINAL_STATUSES = new Set<SessionStatus>(["idle", "error", "exited"]);
export interface AgentEventPersistenceContext {
  runId: string | null;
}

const INTERRUPTED_BY_RESTART_MESSAGE =
  "The agent was interrupted because Cocurdex restarted before this turn finished. Send a message to continue.";

function applyStoredNetworkProxy(raw: string | null) {
  loadNetworkProxySettingsFromJson(raw, process.env);
  applyNodeGlobalProxy(process.env);
}

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
  private readonly toolOutputs: ToolOutputStore;
  private readonly storageMaintenance: StorageMaintenance;

  constructor(userDataPath: string) {
    this.database = createCocurdexDatabase(getDatabasePath(userDataPath));
    this.toolOutputs = createToolOutputStore(userDataPath);
    this.storageMaintenance = new StorageMaintenance({
      toolCalls: this.database.toolCalls,
      toolOutputs: this.toolOutputs,
      commandReceipts: this.database.commandReceipts,
      sync: this.database.sync,
      reclaimFreePages: (maxPages) => this.database.reclaimFreePages(maxPages),
      isClosed: () => this.closed,
    });
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
    this.storageMaintenance.dispose();
    this.database.transaction(() => {
      for (const message of this.deltaBuffer.drainAll()) {
        void this.database.messages.append(message);
      }
    });
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

  async bootstrap(): Promise<StoredBootstrapData> {
    await this.waitForStartupRecovery();

    const queuedAgentInputs = await this.database.queuedAgentInputs.list();
    const queuedMessages = await Promise.all(
      queuedAgentInputs.map((input) =>
        this.database.messages.getById(input.messageId),
      ),
    );

    const syncCursor = formatSyncCursor(this.database.sync.readClock());
    return {
      syncCursor,
      workspaces: await this.database.workspaces.list(),
      sessions: await this.database.sessions.list(),
      queuedMessages: queuedMessages.filter(
        (message): message is MessageRecord => message != null,
      ),
      queuedAgentInputs,
      activeRuns: this.database.runs.listActive(),
      sessionUsage: await this.database.sessionUsage.list(),
      editorViews: await this.database.editorViews.list(),
    };
  }

  private async loadAndApplyNetworkProxy() {
    try {
      const raw = await this.database.appSettings.get(
        NETWORK_PROXY_SETTING_KEY,
      );
      applyStoredNetworkProxy(raw);
    } catch (error) {
      logDaemonDiagnostic("warn", "networkProxy.loadFailed", {
        error: error instanceof Error ? error.message : String(error),
      });
      applyStoredNetworkProxy(null);
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

  async deleteWorkspace(workspaceId: string) {
    await this.database.workspaces.delete(workspaceId);
    this.storageMaintenance.schedule();
  }

  async listSessionMessages(sessionId: string): Promise<SessionMessagesResult> {
    const [messages, turnStats, turnChangeSets] = await Promise.all([
      this.listMessagesBySessionId(sessionId),
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
    applyStoredNetworkProxy(valueJson);
  }

  get appSettings() {
    return this.database.appSettings;
  }

  get hostAccessStore() {
    return {
      repository: this.database.hostAccess,
      settings: this.database.appSettings,
    };
  }

  get data() {
    return {
      decks: this.database.decks,
      entityLinks: this.database.entityLinks,
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

  setSessionPinned(sessionId: string, pinnedAt: string | null) {
    return this.database.sessions.setPinned(sessionId, pinnedAt);
  }

  archiveSession(sessionId: string, archivedAt?: string) {
    return this.database.sessions.archive(sessionId, archivedAt);
  }

  async deleteSession(sessionId: string) {
    await this.database.turnChangeSets.deleteBySessionId(sessionId);
    await this.database.sessions.delete(sessionId);
    this.storageMaintenance.schedule();
  }

  maintainStorage(): Promise<void> {
    return this.storageMaintenance.run();
  }

  async getToolCallResult(toolCallId: string) {
    const stored = await this.database.toolCalls.getResultById(toolCallId);
    if (!stored) {
      return null;
    }
    if (!stored.resultRef) {
      return stored.result;
    }
    return (
      (await this.toolOutputs.get(stored.resultRef)) ?? {
        content: [],
        rawOutput: null,
      }
    );
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

  syncSources(
    runtime: Pick<SyncPullSources, "getPlan" | "getInteractions">,
  ): SyncPullSources {
    const { database } = this;
    const settled = (messages: MessageRecord[]) =>
      messages.filter((message) => !this.deltaBuffer.has(message.id));
    return {
      ...runtime,
      readClock: () => database.sync.readClock(),
      bootstrap: () => this.bootstrap(),
      listSessionsChangedSince: (since) =>
        database.sessions.listChangedSince(since),
      listTombstonesSince: (since) => database.sync.listTombstonesSince(since),
      listMessages: (sessionId) => this.listMessagesBySessionId(sessionId),
      listMessagesChangedSince: async (sessionId, since) =>
        settled(await database.messages.listChangedSince(sessionId, since)),
      listActiveMessages: (sessionId) => this.deltaBuffer.list(sessionId),
      listToolCalls: (sessionId) =>
        database.toolCalls.listSummariesBySessionId(sessionId),
      listToolCallsChangedSince: (sessionId, since) =>
        database.toolCalls.listSummariesChangedSince(sessionId, since),
      listTurnStats: (sessionId) =>
        database.messageTurnStats.listBySessionId(sessionId),
      listTurnStatsChangedSince: (sessionId, since) =>
        database.messageTurnStats.listChangedSince(sessionId, since),
      listTurnChangeSets: (sessionId) =>
        database.turnChangeSets.listBySessionId(sessionId),
      hasTurnChangeSetsChangedSince: async (sessionId, since) =>
        database.sync.hasTurnChangeSetsChangedSince(sessionId, since),
    };
  }

  async listMessagesBySessionId(sessionId: string) {
    const messages = await this.database.messages.listBySessionId(sessionId);
    return messages.filter((message) => !this.deltaBuffer.has(message.id));
  }

  async listToolCallsBySessionId(sessionId: string) {
    const [toolCalls, resultRefs] = await Promise.all([
      this.database.toolCalls.listBySessionId(sessionId),
      this.database.toolCalls.listResultRefsBySessionId(sessionId),
    ]);
    if (resultRefs.size === 0) {
      return toolCalls;
    }
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        const ref = resultRefs.get(toolCall.id);
        const result = ref ? await this.toolOutputs.get(ref) : null;
        return result ? { ...toolCall, ...result } : toolCall;
      }),
    );
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

  async moveSteeredMessageToEnd(
    message: MessageRecord,
    runId: string | null,
  ): Promise<MessageRecord> {
    let moved: Promise<number | null> = Promise.resolve(null);
    this.database.transaction(() => {
      moved = this.database.messages.moveToEnd(message.id, message.sessionId);
      if (runId) void this.database.messages.assignRun(message.id, runId);
    });
    const seq = await moved;
    return withMessageSeq(
      runId ? { ...message, runId } : message,
      seq ?? message.seq,
    );
  }

  async startRun(run: RunRecord): Promise<RunRecord> {
    return this.database.transaction(() => {
      const started = this.database.runs.insert(run);
      void this.database.messages.assignRun(run.triggerMessageId, run.id);
      return started;
    });
  }

  async finishRun(
    runId: string,
    status: Exclude<RunStatus, "running">,
    endedAt: string,
    error: string | null,
  ) {
    return this.database.runs.finish(runId, status, endedAt, error);
  }

  listRunsBySessionId(sessionId: string) {
    return this.database.runs.listBySessionId(sessionId);
  }

  getActiveRun(sessionId: string) {
    return this.database.runs.getActiveBySessionId(sessionId);
  }

  listActiveRuns() {
    return this.database.runs.listActive();
  }

  getLatestRun(sessionId: string) {
    return this.database.runs.listBySessionId(sessionId).at(-1) ?? null;
  }

  async getRunReply(sessionId: string, runId: string) {
    const replies = (await this.listMessagesBySessionId(sessionId)).filter(
      (message) => message.runId === runId && message.role === "assistant",
    );
    return replies.at(-1) ?? null;
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

  getProviderSession(sessionId: string, agentType: AgentId) {
    return this.database.providerSessions.get(sessionId, agentType);
  }

  async saveProviderSession(
    agentType: AgentId,
    record: AgentProviderSessionRecord,
  ) {
    await this.database.providerSessions.upsert(agentType, record);
  }

  async clearProviderSession(sessionId: string, agentType: AgentId) {
    await this.database.providerSessions.clear(sessionId, agentType);
  }

  createForkedSession(
    session: SessionRecord,
    messages: readonly MessageRecord[],
    transfer: ContextTransferRecord,
  ) {
    this.database.transaction(() => {
      void this.database.sessions.upsert(session);
      for (const message of messages) {
        void this.database.messages.append(message);
      }
      this.database.contextTransfers.insert(transfer);
    });
  }

  listContextTransfers(sessionId: string) {
    return this.database.contextTransfers.listByTargetSession(sessionId);
  }

  findPendingContextTransfer(sessionId: string) {
    return this.database.contextTransfers.findPending(sessionId);
  }

  insertContextTransfer(record: ContextTransferRecord) {
    this.database.contextTransfers.insert(record);
  }

  consumeContextTransfer(id: string, consumption: ContextTransferConsumption) {
    this.database.contextTransfers.consume(id, consumption);
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

  async persistAgentEvent(
    event: AgentEvent,
    context: AgentEventPersistenceContext = { runId: null },
  ): Promise<AgentEvent> {
    const eventTimestamp = new Date().toISOString();
    const runId = context.runId;

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
      const message = {
        ...event.message,
        seq: event.message.seq ?? buffered?.seq,
        runId: event.message.runId ?? runId,
      };
      const seq = await this.database.messages.append(message);
      const session = await this.database.sessions.getById(event.sessionId);

      if (session) {
        await this.database.sessions.upsert({
          ...session,
          updatedAt: event.message.createdAt,
          lastMessageAt: event.message.createdAt,
        });
      }
      const stamped = message.runId
        ? { ...event, message: { ...event.message, runId: message.runId } }
        : event;
      return withTimelineSeq(stamped, seq);
    }

    if (event.type === "message.delta") {
      const seq = this.deltaBuffer.has(event.messageId)
        ? null
        : await this.reserveTimelineSeq(event.sessionId, event.messageId);
      const buffered = this.deltaBuffer.append(event, seq);
      const checkpoint = this.deltaBuffer.takeCheckpoint(event.messageId);
      if (checkpoint) {
        await this.database.messages.append({
          ...checkpoint,
          runId: checkpoint.runId ?? runId,
        });
      }
      return withTimelineSeq(event, buffered.seq);
    }

    if (
      event.type === "tool.started" ||
      event.type === "tool.updated" ||
      event.type === "tool.finished"
    ) {
      const toolCall = capToolCallOutput({
        ...event.toolCall,
        runId: event.toolCall.runId ?? runId,
      });
      const seq = await this.database.toolCalls.upsert(toolCall);
      if (toolCall.status === "completed" || toolCall.status === "failed") {
        this.storageMaintenance.schedule();
      }
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
      const systemMessage: MessageRecord = {
        ...this.createSystemMessage(
          event.sessionId,
          event.message,
          eventTimestamp,
        ),
        ...(runId ? { runId } : {}),
      };
      const seq = await this.database.messages.append(systemMessage);
      const session = await this.database.sessions.getById(event.sessionId);

      if (session) {
        await this.database.sessions.upsert({
          ...session,
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
    const createdAt = new Date().toISOString();
    const { sessionIds } = this.database.transaction(() =>
      this.database.runs.interruptRunning(createdAt),
    );
    await this.database.teams.failActiveMembers();
    await this.noteRestartInterruptions(sessionIds, createdAt);
  }

  async noteRestartInterruptions(
    sessionIds: string[],
    createdAt = new Date().toISOString(),
  ) {
    for (const sessionId of sessionIds) {
      await this.flushBufferedMessages(sessionId);
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

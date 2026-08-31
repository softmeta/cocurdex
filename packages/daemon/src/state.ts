import crypto from "node:crypto";
import { createCocurdexDatabase, type WorkflowRepository } from "@cocurdex/db";
import type {
  AgentEvent,
  AgentId,
  AgentProviderSelection,
  AgentToolCallRecord,
  AgentUsageUpdatedEvent,
  AppBootstrapData,
  EditorViewRecord,
  MessageRecord,
  ProviderConfigRecord,
  ProviderModelRecord,
  QueuedAgentInputRecord,
  SessionRecord,
  SessionStatus,
  WorkspaceRecord,
} from "@cocurdex/shared";
import {
  childSessionFromSubagentToolCall,
  getContextUsageTokens,
  loadNetworkProxySettingsFromJson,
  mergeUsageRecords,
  NETWORK_PROXY_SETTING_KEY,
} from "@cocurdex/shared";
import { SessionAttentionProjection } from "./attention";
import { logDaemonDiagnostic } from "./diagnostics";
import { createMessageDeltaBuffer } from "./message-delta-buffer";
import { getDatabasePath } from "./paths";

type CocurdexDatabase = ReturnType<typeof createCocurdexDatabase>;
const TERMINAL_STATUSES = new Set<SessionStatus>(["idle", "error", "exited"]);

export class DaemonState {
  readonly sessionAttention: SessionAttentionProjection;
  readonly workflows: WorkflowRepository;
  private closed = false;
  private readonly database: CocurdexDatabase;
  private readonly deltaBuffer = createMessageDeltaBuffer();
  private networkProxyReady: Promise<void>;
  private staleToolCallsSwept: Promise<void>;
  private staleChatStreamsSwept: Promise<void>;

  constructor(userDataPath: string) {
    this.database = createCocurdexDatabase(getDatabasePath(userDataPath));
    this.workflows = this.database.workflows;
    this.sessionAttention = new SessionAttentionProjection(
      this.database.sessionAttention,
      this.database.sessions,
    );
    // Capture shell-inherited proxy env, then overlay the app setting so agent
    // spawns and daemon fetch see a consistent policy for this process.
    this.networkProxyReady = this.loadAndApplyNetworkProxy();
    // Runs once per daemon process, before any agent can start a turn: at this
    // point a non-terminal tool call can only be debris from a previous run.
    this.staleToolCallsSwept = this.database.toolCalls.failNonTerminal();
    // Same reasoning for pure-chat turns: an assistant message still marked
    // `streaming` when this process starts can have no stream behind it.
    this.staleChatStreamsSwept =
      this.database.conversationMessages.failStreaming();
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.database.close();
  }

  async bootstrap(): Promise<AppBootstrapData> {
    await this.networkProxyReady;
    await this.staleToolCallsSwept;
    await this.database.sessions.normalizeRunningToIdle();

    return {
      workspaces: await this.database.workspaces.list(),
      sessions: await this.database.sessions.list(),
      messages: await this.database.messages.list(),
      queuedAgentInputs: await this.database.queuedAgentInputs.list(),
      sessionUsage: await this.database.sessionUsage.list(),
      toolCalls: await this.database.toolCalls.list(),
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

  async callStorage(operation: string, args: unknown[]): Promise<unknown> {
    if (
      operation === "appSetting.set" &&
      args[0] === NETWORK_PROXY_SETTING_KEY
    ) {
      await this.networkProxyReady;
    }
    if (operation.startsWith("conversation")) {
      // The renderer lists conversations outside app.bootstrap, so the stale
      // stream sweep has to be awaited here or the first read can still return
      // a message stuck in `streaming`.
      await this.staleChatStreamsSwept;
    }
    switch (operation) {
      case "workspace.delete":
        return this.database.workspaces.delete(args[0] as string);
      case "session.save":
        return this.database.sessions.upsert(args[0] as SessionRecord);
      case "session.archive":
        return this.database.sessions.archive(
          args[0] as string,
          args[1] as string | undefined,
        );
      case "session.get":
        return this.database.sessions.getById(args[0] as string);
      case "session.updateTitle":
        return this.database.sessions.updateTitle(
          args[0] as string,
          args[1] as string,
          args[2] as string | undefined,
        );
      case "message.listBySession":
        return {
          messages: await this.database.messages.listBySessionId(
            args[0] as string,
          ),
          turnStats: await this.database.messageTurnStats.listBySessionId(
            args[0] as string,
          ),
          turnChangeSets: await this.database.turnChangeSets.listBySessionId(
            args[0] as string,
          ),
        };
      case "message.get":
        return this.database.messages.getById(args[0] as string);
      case "toolCall.listBySession":
        return this.database.toolCalls.listSummariesBySessionId(
          args[0] as string,
        );
      case "toolCall.getResult":
        return this.database.toolCalls.getResultById(args[0] as string);
      case "editorView.save":
        return this.database.editorViews.upsert(args[0] as EditorViewRecord);
      case "providerConfig.list":
        return this.database.providerConfigs.list();
      case "providerConfig.get":
        return this.database.providerConfigs.getById(args[0] as string);
      case "providerConfig.save":
        return this.database.providerConfigs.upsert(
          args[0] as ProviderConfigRecord,
        );
      case "providerConfig.delete":
        return this.database.providerConfigs.delete(args[0] as string);
      case "providerConfig.setSecret":
        return this.database.providerConfigs.setApiKeySecretId(
          args[0] as string,
          args[1] as string | null,
        );
      case "providerModel.list":
        return this.database.providerModels.list(args[0] as string | undefined);
      case "providerModel.get":
        return this.database.providerModels.get(
          args[0] as string,
          args[1] as string,
        );
      case "providerModel.save":
        return this.database.providerModels.upsert(
          args[0] as ProviderModelRecord,
        );
      case "providerModel.delete":
        return this.database.providerModels.delete(
          args[0] as string,
          args[1] as string,
        );
      case "providerModel.deleteByProvider":
        return this.database.providerModels.deleteByProvider(args[0] as string);
      case "providerSecret.get":
        return this.database.providerSecrets.getById(args[0] as string);
      case "providerSecret.save":
        return this.database.providerSecrets.upsert(
          args[0] as {
            id: string;
            encryptedValue: string;
            createdAt: string;
            updatedAt: string;
          },
        );
      case "providerSecret.delete":
        return this.database.providerSecrets.delete(args[0] as string);
      case "conversation.list":
        return this.database.conversations.list();
      case "conversation.get":
        return this.database.conversations.getById(args[0] as string);
      case "conversation.save":
        return this.database.conversations.upsert(args[0] as never);
      case "conversation.updateTitle":
        return this.database.conversations.updateTitle(
          args[0] as string,
          args[1] as string,
        );
      case "conversation.archive":
        return this.database.conversations.archive(args[0] as string);
      case "conversation.delete":
        return this.database.conversations.delete(args[0] as string);
      case "conversation.updateLastMessageAt":
        return this.database.conversations.updateLastMessageAt(
          args[0] as string,
          args[1] as string | null,
        );
      case "conversationMessage.list":
        return this.database.conversationMessages.listByConversationId(
          args[0] as string,
        );
      case "conversationMessage.get":
        return this.database.conversationMessages.getById(args[0] as string);
      case "conversationMessage.save":
        return this.database.conversationMessages.upsert(args[0] as never);
      case "conversationMessage.patch":
        return this.database.conversationMessages.patch(
          args[0] as string,
          args[1] as never,
        );
      case "conversationMessage.delete":
        return this.database.conversationMessages.deleteById(args[0] as string);
      case "appSetting.get":
        return this.database.appSettings.get(args[0] as string);
      case "appSetting.set": {
        const key = args[0] as string;
        const valueJson = args[1] as string;
        await this.database.appSettings.set(key, valueJson);
        if (key === NETWORK_PROXY_SETTING_KEY) {
          loadNetworkProxySettingsFromJson(valueJson, process.env);
        }
        return;
      }
      case "agentProviderDefault.list":
        return this.database.agentProviderDefaults.list();
      case "agentProviderDefault.get":
        return this.database.agentProviderDefaults.getByAgentId(
          args[0] as AgentId,
        );
      case "agentProviderDefault.save":
        return this.database.agentProviderDefaults.upsert(
          args[0] as AgentProviderSelection,
        );
      default:
        throw new Error(`Unsupported storage operation: ${operation}`);
    }
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

  async saveUserMessage(message: MessageRecord) {
    const session = await this.database.sessions.getById(message.sessionId);
    this.database.transaction(() => {
      void this.database.messages.append(message);
      if (session) {
        void this.database.sessions.upsert({
          ...session,
          updatedAt: message.createdAt,
          lastMessageAt: message.createdAt,
        });
      }
    });
  }

  async saveQueuedUserMessage(
    message: MessageRecord,
    input: QueuedAgentInputRecord,
  ) {
    const session = await this.database.sessions.getById(message.sessionId);
    this.database.transaction(() => {
      void this.database.messages.append(message);
      void this.database.queuedAgentInputs.enqueue(input);
      if (session) {
        void this.database.sessions.upsert({
          ...session,
          updatedAt: message.createdAt,
          lastMessageAt: message.createdAt,
        });
      }
    });
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

  async rewindSessionMessages(message: MessageRecord) {
    const session = await this.database.sessions.getById(message.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    this.database.transaction(() => {
      void this.database.messages.deleteAfter(
        message.sessionId,
        message.createdAt,
      );
      void this.database.toolCalls.deleteAfter(
        message.sessionId,
        message.createdAt,
      );
      void this.database.messages.update(message);
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

  async saveProviderModel(model: ProviderModelRecord) {
    await this.database.providerModels.upsert(model);
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

  async persistAgentEvent(event: AgentEvent) {
    const eventTimestamp = new Date().toISOString();

    if (event.type === "state.changed") {
      if (TERMINAL_STATUSES.has(event.status)) {
        await this.flushBufferedMessages(event.sessionId);
      }
      await this.database.sessions.updateStatus(event.sessionId, event.status);
      return;
    }

    if (event.type === "session.upserted") {
      await this.database.sessions.upsert(event.session);
      return;
    }

    if (event.type === "session.title.updated") {
      await this.updateSessionTitle(event.sessionId, event.title, {
        expectedTitle: event.expectedTitle,
        updatedAt: event.updatedAt,
      });
      return;
    }

    if (event.type === "message.completed") {
      this.deltaBuffer.release(event.message.id);
      await this.database.messages.append(event.message);
      const session = await this.database.sessions.getById(event.sessionId);

      if (!session) {
        return;
      }

      await this.database.sessions.upsert({
        ...session,
        status: "idle",
        updatedAt: event.message.createdAt,
        lastMessageAt: event.message.createdAt,
      });
      return;
    }

    if (event.type === "message.delta") {
      this.deltaBuffer.append(event);
      return;
    }

    if (
      event.type === "tool.started" ||
      event.type === "tool.updated" ||
      event.type === "tool.finished"
    ) {
      await this.database.toolCalls.upsert(event.toolCall);
      await this.persistSubagentChildSession(event.toolCall);
      return;
    }

    if (event.type === "usage.updated") {
      await this.logSessionTokenUsage(event);
      await this.database.sessionUsage.add(
        event.sessionId,
        event.usage,
        event.receivedAt,
      );
      return;
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
      return;
    }

    if (event.type === "error") {
      await this.flushBufferedMessages(event.sessionId);
      await this.database.messages.append(
        this.createSystemMessage(
          event.sessionId,
          event.message,
          eventTimestamp,
        ),
      );
      const session = await this.database.sessions.getById(event.sessionId);

      if (!session) {
        return;
      }

      await this.database.sessions.upsert({
        ...session,
        status: "error",
        updatedAt: eventTimestamp,
        lastMessageAt: eventTimestamp,
      });
    }
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
      existing
        ? {
            ...child,
            createdAt: existing.createdAt,
            lastMessageAt: existing.lastMessageAt,
          }
        : child,
    );
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

import { EventEmitter } from "node:events";
import {
  deleteOpenCodeSession,
  readAdapterRateLimits as probeAdapterRateLimits,
} from "@cocurdex/agent-adapters";
import {
  AgentSteeringUnavailableError,
  createAgentRegistry,
  detectAgentInstallations,
} from "@cocurdex/agent-core";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type {
  AgentEvent,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentRuntimeProviderConfig,
  AppBootstrapData,
  CocurdexDaemonEvent,
  CreateSessionPayload,
  CreateWorkflowPayload,
  MessageRecord,
  SendSessionMessagePayload,
  TurnChangeFileContentRequest,
  UndoTurnChangesInput,
  UpdateSessionAttentionPayload,
  UpdateSessionTitlePayload,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { getNetworkProxySettings } from "@cocurdex/shared";
import { discoverInstalledAgentCapabilities } from "./agents";
import { DaemonChatService } from "./chat";
import { DaemonDataService } from "./data-service";
import { logDaemonDiagnostic } from "./diagnostics";
import { probeNetworkProxy } from "./network-proxy-probe";
import { DaemonProviderService } from "./provider-service";
import { AgentRuntimeManager, type RuntimePersistence } from "./runtime";
import { DaemonState } from "./state";
import {
  DaemonWorkflowAgentTurnRunner,
  type DecideWorkflowGateInput,
  RuntimeWorkflowActionExecutor,
  WorkflowModule,
  WorkflowWorker,
  WorkflowWorkerScheduler,
} from "./workflow";
import {
  createWorkspaceChangeCoordinator,
  type WorkspaceChangeCoordinator,
} from "./workspace-changes";

export interface CocurdexDaemonServiceOptions {
  runtimeFingerprint: string;
  socketPath?: string;
  startedAt?: string;
  userDataPath: string;
}

export interface CocurdexDaemonStatus {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

interface QueuedFollowUp {
  payload: SendSessionMessagePayload & { messageId: string };
  providerConfig: AgentRuntimeProviderConfig | null;
}

/** How often checkpoint retention runs on a daemon that never restarts. */
const CHECKPOINT_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class CocurdexDaemonService {
  readonly chatService: DaemonChatService;
  readonly events = new EventEmitter();
  readonly dataService: DaemonDataService;
  readonly providerService: DaemonProviderService;
  readonly runtime: AgentRuntimeManager;
  readonly state: DaemonState;
  readonly workflows: WorkflowModule;
  readonly workspaceChanges: WorkspaceChangeCoordinator;
  private readonly runtimeFingerprint: string;
  private readonly socketPath: string;
  private readonly startedAt: string;
  private readonly pendingTurns = new Map<string, { cancelled: boolean }>();
  private readonly queuedFollowUps = new Map<string, QueuedFollowUp[]>();
  private readonly workflowWorkerScheduler: WorkflowWorkerScheduler;
  private shutdownPromise: Promise<void> | null = null;
  private readonly checkpointReconcileTimer: NodeJS.Timeout;

  constructor(options: CocurdexDaemonServiceOptions) {
    this.runtimeFingerprint = options.runtimeFingerprint;
    this.socketPath = options.socketPath ?? "";
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.state = new DaemonState(options.userDataPath);
    this.chatService = new DaemonChatService({
      getDatabase: () => this.state.getChatDatabase(),
      broadcast: (event) => this.events.emit("daemon.event", event),
    });
    this.workflows = new WorkflowModule(this.state.workflows);
    this.dataService = new DaemonDataService(this.state, this.events);
    this.providerService = new DaemonProviderService(this.state);
    this.runtime = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => {
        this.events.emit("daemon.event", event);
      },
      userDataPath: options.userDataPath,
    });
    this.workspaceChanges = createWorkspaceChangeCoordinator({
      userDataPath: options.userDataPath,
      repository: this.state.turnChangeSets,
      getNativeSession: (sessionId) => this.runtime.getAgentSession(sessionId),
      onChangeSet: (changeSet) => {
        this.events.emit("daemon.event", {
          type: "workspace.changes.updated",
          sessionId: changeSet.sessionId,
          changeSet,
        });
      },
    });
    void this.reconcileWorkspaceChanges();
    // Retention only runs inside reconcile, so a long-lived daemon would never
    // expire checkpoints without this heartbeat.
    this.checkpointReconcileTimer = setInterval(
      () => void this.reconcileWorkspaceChanges(),
      CHECKPOINT_RECONCILE_INTERVAL_MS,
    );
    this.checkpointReconcileTimer.unref?.();
    this.runtime.configureAgentEventPersistence(async (event) => {
      await this.state.persistAgentEvent(event);
      await this.state.sessionAttention.applyEvent(event);
      if (event.type === "tool.started") {
        this.workspaceChanges.markToolActivity(event.sessionId);
      }
      if (event.type === "workspace.native-evidence") {
        await this.workspaceChanges.ingestNativeEvidence({
          sessionId: event.sessionId,
          userMessageId: event.userMessageId,
          evidence: event.evidence,
        });
      }
      if (
        event.type === "message.completed" &&
        event.message.role === "assistant"
      ) {
        await this.workspaceChanges.bindAssistantMessage({
          sessionId: event.sessionId,
          messageId: event.message.id,
        });
      }
      if (event.type === "turn.completed") {
        await this.workspaceChanges.finalizeTurn({
          sessionId: event.sessionId,
          messageId: event.messageId,
        });
      }
      // Only a terminal error ends the turn; a mid-turn "error" event can be
      // followed by more tool calls whose changes still belong to this turn.
      if (event.type === "state.changed" && event.status === "error") {
        await this.workspaceChanges.failTurn(event.sessionId, "failed");
      }
    });
    const workflowExecutor = new RuntimeWorkflowActionExecutor(
      new DaemonWorkflowAgentTurnRunner(this.state, this.runtime),
    );
    const workflowWorker = new WorkflowWorker(
      this.state.workflows,
      workflowExecutor,
      {
        workerId: `${this.runtimeFingerprint}:${process.pid}`,
        leaseDurationMs: 60_000,
        now: () => new Date().toISOString(),
        createId: () => crypto.randomUUID(),
      },
    );
    this.workflowWorkerScheduler = new WorkflowWorkerScheduler(workflowWorker, {
      concurrency: 4,
    });
    this.wakeWorkflowWorker();
  }

  status(): CocurdexDaemonStatus {
    return {
      pid: process.pid,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: this.runtimeFingerprint,
      socketPath: this.socketPath,
      startedAt: this.startedAt,
    };
  }

  shutdown() {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.performShutdown();
    }
    return this.shutdownPromise;
  }

  bootstrap(): Promise<AppBootstrapData> {
    return this.state.bootstrap();
  }

  async listAgents() {
    const agents = await detectAgentInstallations(createAgentRegistry().list());
    return discoverInstalledAgentCapabilities(agents);
  }

  readAdapterRateLimits(agentIds: AgentId[]) {
    return probeAdapterRateLimits(agentIds);
  }

  testNetworkProxy() {
    return probeNetworkProxy(getNetworkProxySettings());
  }

  listSessionAttention() {
    return this.state.sessionAttention.list();
  }

  updateSessionAttention(payload: UpdateSessionAttentionPayload) {
    return this.state.sessionAttention.update(payload);
  }

  listWorkspaces() {
    return this.state.listWorkspaces();
  }

  private async reconcileWorkspaceChanges() {
    try {
      const workspaces = await this.state.listWorkspaces();
      await this.workspaceChanges.reconcile(
        workspaces.map((workspace) => workspace.rootPath),
      );
    } catch (error) {
      logDaemonDiagnostic("warn", "workspace-changes.reconcile failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async saveWorkspace(workspace: WorkspaceRecord) {
    await this.state.saveWorkspace(workspace);
    return workspace;
  }

  listSessions() {
    return this.state.listSessions();
  }

  async getSessionSnapshot(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      return null;
    }

    const [
      messages,
      activeMessages,
      toolCalls,
      queuedAgentInputs,
      usage,
      turnChangeSets,
    ] = await Promise.all([
      this.state.listMessagesBySessionId(sessionId),
      this.state.listActiveMessagesBySessionId(sessionId),
      this.state.listToolCallsBySessionId(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.getSessionUsage(sessionId),
      this.state.listTurnChangeSets(sessionId),
    ]);

    return {
      session,
      messages,
      activeMessages,
      toolCalls,
      queuedAgentInputs,
      usage,
      turnChangeSets,
      interactions: this.runtime.getSessionInteractions(sessionId),
    };
  }

  listWorkflowRuns() {
    return this.workflows.listRuns();
  }

  getWorkflowRun(workflowRunId: string) {
    return this.workflows.get(workflowRunId);
  }

  async createWorkflow(payload: CreateWorkflowPayload) {
    for (const binding of Object.values(payload.bindings)) {
      const agent = await this.ensureAgentAvailable(binding.agentId);
      const requiredWriteMode =
        binding.permissionProfile === "read_only"
          ? "read-only"
          : "native-write";
      if (!agent.capabilities.writeModes.includes(requiredWriteMode)) {
        throw new Error(
          `${agent.label} cannot satisfy workflow permission profile '${binding.permissionProfile}'.`,
        );
      }
    }
    return this.workflows.create(payload);
  }

  async startWorkflow(workflowRunId: string) {
    const aggregate = await this.workflows.start(workflowRunId);
    this.wakeWorkflowWorker();
    return aggregate;
  }

  async decideWorkflowGate(input: DecideWorkflowGateInput) {
    const aggregate = await this.workflows.decideGate(input);
    this.wakeWorkflowWorker();
    return aggregate;
  }

  async cancelWorkflow(workflowRunId: string) {
    const current = await this.workflows.get(workflowRunId);
    const aggregate = await this.workflows.cancel(workflowRunId);
    const activeSessionIds = new Set(
      current?.attempts
        .filter((attempt) => attempt.status === "running" && attempt.sessionId)
        .map((attempt) => attempt.sessionId as string) ?? [],
    );
    await Promise.all(
      Array.from(activeSessionIds, (sessionId) =>
        this.runtime.cancelSessionTurn(sessionId),
      ),
    );
    return aggregate;
  }

  async createSession(payload: CreateSessionPayload) {
    await this.ensureAgentAvailable(payload.session.agentType);
    await this.state.saveSession(payload.session);
    return payload.session;
  }

  async deleteSession(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      return;
    }

    const providerSession = await this.state.getProviderSession(sessionId);
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    await this.workspaceChanges.deleteSessionCheckpoints(
      sessionId,
      workspace?.rootPath,
    );
    await this.disposeSessionRuntime(sessionId);

    if (
      session.agentType === "opencode" &&
      providerSession?.providerSessionId
    ) {
      if (!workspace) {
        throw new Error(`Workspace ${session.workspaceId} not found`);
      }
      await deleteOpenCodeSession({
        providerSessionId: providerSession.providerSessionId,
        workspaceRootPath: workspace.rootPath,
      });
    }

    await this.state.deleteSession(sessionId);
  }

  async updateSessionTitle(payload: UpdateSessionTitlePayload) {
    const updatedSession = await this.state.updateSessionTitle(
      payload.sessionId,
      payload.title,
      {
        expectedTitle: payload.expectedTitle,
        updatedAt: payload.updatedAt,
      },
    );
    if (!updatedSession || updatedSession.title !== payload.title) {
      return updatedSession;
    }

    try {
      await this.runtime.setSessionTitle(payload.sessionId, payload.title);
    } catch (error) {
      logDaemonDiagnostic("warn", "[SessionTitle] Native sync failed", {
        error: error instanceof Error ? error.message : String(error),
        sessionId: payload.sessionId,
      });
    }
    return updatedSession;
  }

  generateSessionTitle(sessionId: string, message: string) {
    return this.runtime.generateSessionTitle(sessionId, message);
  }

  listSessionSlashCommands(agentType: AgentId, workspaceRootPath: string) {
    return this.runtime.listSessionSlashCommands(agentType, workspaceRootPath);
  }

  async undoTurnChanges(input: UndoTurnChangesInput) {
    const workspaceRootPath = await this.requireWorkspaceRootPath(
      input.sessionId,
    );
    return this.workspaceChanges.undo({
      ...input,
      workspaceRootPath,
    });
  }

  async getTurnChangeFile(input: TurnChangeFileContentRequest) {
    const workspaceRootPath = await this.requireWorkspaceRootPath(
      input.sessionId,
    );
    return this.workspaceChanges.getFileContent({
      ...input,
      workspaceRootPath,
    });
  }

  async rewindSession(message: MessageRecord) {
    if (this.pendingTurns.has(message.sessionId)) {
      throw new Error(
        `Session ${message.sessionId} still has an active turn after stop`,
      );
    }
    this.queuedFollowUps.delete(message.sessionId);
    await this.state.rewindSessionMessages(message);
    await this.state.deleteQueuedAgentInput(message.id);
  }

  async sendSessionMessage(
    payload: SendSessionMessagePayload,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    const isSteering = payload.delivery === "steer-active-run";
    const isQueuedFollowUp = payload.delivery === "queue-after-run";
    const hasActiveTurn = this.pendingTurns.has(payload.session.id);
    if (hasActiveTurn && !isSteering && !isQueuedFollowUp) {
      throw new Error(
        `Session ${payload.session.id} already has an active turn`,
      );
    }
    if (isSteering && !hasActiveTurn) {
      throw new Error(`Session ${payload.session.id} has no active turn`);
    }

    if (isSteering) {
      const agent = await this.ensureAgentAvailable(payload.session.agentType);
      if (!agent.capabilities.supportsSteering) {
        throw new Error(
          `${agent.label} does not support steering active turns.`,
        );
      }
      await this.state.saveSession(payload.session);
      const userMessage = this.createUserMessage(payload);
      await this.state.saveUserMessage(userMessage);
      void this.dispatchSteeringMessage(payload, userMessage, providerConfig);
      return userMessage;
    }

    if (isQueuedFollowUp && hasActiveTurn) {
      await this.ensureAgentAvailable(payload.session.agentType);
      await this.state.saveSession(payload.session);
      const userMessage = this.createUserMessage(payload);
      await this.state.saveQueuedUserMessage(userMessage, {
        messageId: userMessage.id,
        sessionId: userMessage.sessionId,
        workspaceRootPath: payload.workspaceRootPath,
        thinkingLevel: payload.thinkingLevel,
        createdAt: userMessage.createdAt,
      });
      const queued = this.queuedFollowUps.get(payload.session.id) ?? [];
      queued.push({
        payload: {
          ...payload,
          messageId: userMessage.id,
          createdAt: userMessage.createdAt,
          delivery: "start-new-run",
        },
        providerConfig,
      });
      this.queuedFollowUps.set(payload.session.id, queued);
      return userMessage;
    }

    const pendingTurn = { cancelled: false };
    this.pendingTurns.set(payload.session.id, pendingTurn);
    let userMessage: MessageRecord;
    let persistence: RuntimePersistence;
    try {
      await this.ensureAgentAvailable(payload.session.agentType);
      await this.state.saveSession(payload.session);
      userMessage = this.createUserMessage(payload);
      await this.state.saveUserMessage(userMessage);
      persistence = {
        ...(await this.createRuntimePersistence(payload.session.id)),
        providerConfig,
      };
      this.runtime.createSessionRuntime(payload, persistence);
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId: payload.session.id,
        status: "running",
      });
    } catch (error) {
      this.pendingTurns.delete(payload.session.id);
      throw error;
    }

    void this.dispatchSessionMessage(
      payload,
      userMessage,
      pendingTurn,
      persistence,
      providerConfig,
    )
      .catch(async (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown agent runtime error";
        console.error("[CocurdexDaemonService] Background send failed", {
          agentType: payload.session.agentType,
          error: message,
          sessionId: payload.session.id,
        });
        this.runtime.emitAgentEvent({
          type: "error",
          sessionId: payload.session.id,
          message,
        });
      })
      .finally(() => {
        if (this.pendingTurns.get(payload.session.id) === pendingTurn) {
          this.pendingTurns.delete(payload.session.id);
          void this.startNextQueuedFollowUp(payload.session.id);
        }
      });

    return userMessage;
  }

  async resumeQueuedSession(
    sessionId: string,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    if (
      this.pendingTurns.has(sessionId) ||
      this.queuedFollowUps.has(sessionId)
    ) {
      return false;
    }

    const [session, inputs, messages] = await Promise.all([
      this.state.getSession(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.listMessagesBySessionId(sessionId),
    ]);
    if (!session || inputs.length === 0) return false;

    const messageById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const queued = inputs.flatMap((input): QueuedFollowUp[] => {
      const message = messageById.get(input.messageId);
      if (!message) return [];
      return [
        {
          payload: {
            session,
            workspaceRootPath: input.workspaceRootPath,
            messageId: message.id,
            createdAt: message.createdAt,
            content: message.content,
            attachments: message.attachments,
            thinkingLevel: input.thinkingLevel,
            delivery: "start-new-run",
          },
          providerConfig,
        },
      ];
    });
    if (queued.length === 0) return false;

    this.queuedFollowUps.set(sessionId, queued);
    await this.startNextQueuedFollowUp(sessionId);
    return true;
  }

  async updateQueuedAgentInput(
    sessionId: string,
    messageId: string,
    content: string,
  ) {
    const trimmedContent = content.trim();
    const queued = this.queuedFollowUps.get(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    if (!queued || index == null || index < 0) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const message = await this.state.getMessageById(messageId);
    if (
      !message ||
      message.sessionId !== sessionId ||
      message.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    // An image-only queued message has no text, so emptiness is only invalid
    // when the message carries no attachments either.
    if (!trimmedContent && message.attachments.length === 0) {
      throw new Error("Queued message cannot be empty");
    }

    const updatedMessage = { ...message, content: trimmedContent };
    await this.state.updateQueuedUserMessage(updatedMessage);
    queued[index] = {
      ...queued[index],
      payload: { ...queued[index].payload, content: trimmedContent },
    };
    return updatedMessage;
  }

  async deleteQueuedAgentInput(sessionId: string, messageId: string) {
    const queued = this.queuedFollowUps.get(sessionId);
    if (!queued) {
      throw new Error(`Queued message ${messageId} was not found`);
    }
    const nextQueued = queued.filter(
      (item) => item.payload.messageId !== messageId,
    );
    if (nextQueued.length === queued.length) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    await this.state.deleteQueuedUserMessage(messageId);
    if (nextQueued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    } else {
      this.queuedFollowUps.set(sessionId, nextQueued);
    }
  }

  async steerQueuedAgentInput(sessionId: string, messageId: string) {
    if (!this.pendingTurns.has(sessionId)) {
      throw new Error(`Session ${sessionId} has no active turn`);
    }

    const queued = this.queuedFollowUps.get(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    const item = index == null || index < 0 ? undefined : queued?.[index];
    if (!queued || !item || index == null || index < 0) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const message = await this.state.getMessageById(messageId);
    if (
      !message ||
      message.sessionId !== sessionId ||
      message.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const agent = await this.ensureAgentAvailable(
      item.payload.session.agentType,
    );
    if (!agent.capabilities.supportsSteering) {
      throw new Error(`${agent.label} does not support steering active turns.`);
    }

    const [messages, queuedInputs] = await Promise.all([
      this.state.listMessagesBySessionId(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
    ]);
    const queuedMessageIds = new Set(
      queuedInputs.map((input) => input.messageId),
    );
    const history = messages.filter(
      (historyMessage) =>
        historyMessage.id === messageId ||
        !queuedMessageIds.has(historyMessage.id),
    );
    const persistence = await this.createRuntimePersistence(sessionId);
    await this.runtime.sendSessionMessage(
      {
        ...item.payload,
        content: message.content,
        attachments: message.attachments,
        delivery: "steer-active-run",
      },
      { ...persistence, history, providerConfig: item.providerConfig },
    );

    await this.state.deleteQueuedAgentInput(messageId);
    queued.splice(index, 1);
    if (queued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    }
    this.runtime.emitAgentEvent({
      type: "message.completed",
      sessionId,
      message,
    });
    return message;
  }

  private async startNextQueuedFollowUp(sessionId: string) {
    if (this.pendingTurns.has(sessionId)) return;

    const queued = this.queuedFollowUps.get(sessionId);
    const next = queued?.shift();
    if (!next) {
      this.queuedFollowUps.delete(sessionId);
      return;
    }
    if (!queued || queued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    }

    try {
      const userMessage = await this.sendSessionMessage(
        next.payload,
        next.providerConfig,
      );
      await this.state.deleteQueuedAgentInput(next.payload.messageId);
      this.runtime.emitAgentEvent({
        type: "message.completed",
        sessionId,
        message: userMessage,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown queued input error";
      this.runtime.emitAgentEvent({ type: "error", sessionId, message });
      void this.startNextQueuedFollowUp(sessionId);
    }
  }

  setSessionRuntimeMode(sessionId: string, modeId: string) {
    return this.runtime.setSessionRuntimeMode(sessionId, modeId);
  }

  setSessionRuntimeConfigOption(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ) {
    return this.runtime.setSessionRuntimeConfigOption(
      sessionId,
      configId,
      value,
    );
  }

  /** User-facing stop: abandon the current turn, keep the agent session usable. */
  async stopSession(sessionId: string) {
    const pendingTurn = this.clearPendingTurn(sessionId);
    await this.workspaceChanges.failTurn(sessionId, "interrupted");
    const cancelled = await this.runtime.cancelSessionTurn(sessionId);
    if (pendingTurn && !cancelled) {
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId,
        status: "idle",
      });
    }
    return null;
  }

  private async disposeSessionRuntime(sessionId: string) {
    const pendingTurn = this.clearPendingTurn(sessionId);
    this.queuedFollowUps.delete(sessionId);
    const disposed = await this.runtime.disposeSessionRuntime(sessionId);
    if (pendingTurn && !disposed) {
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId,
        status: "idle",
      });
    }
  }

  private clearPendingTurn(sessionId: string) {
    const pendingTurn = this.pendingTurns.get(sessionId);
    if (pendingTurn) {
      pendingTurn.cancelled = true;
      this.pendingTurns.delete(sessionId);
    }
    return pendingTurn;
  }

  resolvePermission(requestId: string, decision: AgentPermissionDecision) {
    return this.runtime.resolveAgentPermission(requestId, decision);
  }

  private async ensureAgentAvailable(agentId: AgentId) {
    const agents = await this.listAgents();
    const agent = agents.find((item) => item.id === agentId);

    if (agent?.availability === "available") {
      return agent;
    }

    throw new Error(
      `${agent?.label ?? agentId} is not available on this machine.`,
    );
  }

  resolveQuestion(questionId: string, answer: string) {
    return this.runtime.resolveAgentQuestion(questionId, answer);
  }

  resolvePlanApproval(approvalId: string, decision: AgentPlanApprovalDecision) {
    return this.runtime.resolveAgentPlanApproval(approvalId, decision);
  }

  private async createRuntimePersistence(
    sessionId: string,
  ): Promise<RuntimePersistence> {
    const providerSession = await this.state.getProviderSession(sessionId);

    return {
      providerSession,
      onProviderSessionUpdate: (nextProviderSession) => {
        if (!nextProviderSession) {
          void this.state.clearProviderSession(sessionId);
          return;
        }

        void this.state.saveProviderSession(
          nextProviderSession.sessionId,
          nextProviderSession.providerSessionId,
          JSON.parse(nextProviderSession.providerStateJson) as Record<
            string,
            unknown
          >,
          nextProviderSession.resumable,
          nextProviderSession.providerVersion,
        );
      },
    };
  }

  private async performShutdown() {
    clearInterval(this.checkpointReconcileTimer);
    for (const pendingTurn of this.pendingTurns.values()) {
      pendingTurn.cancelled = true;
    }
    this.pendingTurns.clear();
    this.queuedFollowUps.clear();
    const schedulerClose = this.workflowWorkerScheduler.close();
    try {
      await this.chatService.shutdown();
      await this.runtime.shutdown();
      await schedulerClose;
    } finally {
      this.state.close();
      this.events.removeAllListeners();
    }
  }

  private wakeWorkflowWorker() {
    void this.workflowWorkerScheduler.wake().catch((error: unknown) => {
      console.error("[CocurdexDaemonService] Workflow worker failed", error);
    });
  }

  private async requireWorkspaceRootPath(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found`);
    }
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${session.workspaceId} not found`);
    }
    return workspace.rootPath;
  }

  private createUserMessage(payload: SendSessionMessagePayload): MessageRecord {
    return {
      id: payload.messageId ?? crypto.randomUUID(),
      sessionId: payload.session.id,
      role: "user",
      content: payload.content.trim(),
      attachments: payload.attachments ?? [],
      createdAt: payload.createdAt ?? new Date().toISOString(),
    };
  }

  private async dispatchSessionMessage(
    payload: SendSessionMessagePayload,
    userMessage: MessageRecord,
    pendingTurn: { cancelled: boolean },
    persistence: RuntimePersistence,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    const [messages, queuedInputs] = await Promise.all([
      this.state.listMessagesBySessionId(payload.session.id),
      this.state.listQueuedAgentInputs(payload.session.id),
    ]);
    const queuedMessageIds = new Set(
      queuedInputs.map((input) => input.messageId),
    );
    const history = messages.filter(
      (message) =>
        message.id === userMessage.id || !queuedMessageIds.has(message.id),
    );
    if (pendingTurn.cancelled) {
      return;
    }

    if (pendingTurn.cancelled) {
      return;
    }

    await this.workspaceChanges.beginTurn({
      sessionId: payload.session.id,
      userMessageId: userMessage.id,
      workspaceRootPath: payload.workspaceRootPath,
    });

    await this.runtime.sendSessionMessage(
      {
        ...payload,
        content: userMessage.content,
        attachments: userMessage.attachments,
      },
      {
        ...persistence,
        history,
        providerConfig,
      },
    );
  }

  private async dispatchSteeringMessage(
    payload: SendSessionMessagePayload,
    userMessage: MessageRecord,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    try {
      const history = await this.state.listMessagesBySessionId(
        payload.session.id,
      );
      const persistence = await this.createRuntimePersistence(
        payload.session.id,
      );
      await this.runtime.sendSessionMessage(
        {
          ...payload,
          content: userMessage.content,
          attachments: userMessage.attachments,
        },
        { ...persistence, history, providerConfig },
      );
    } catch (error) {
      if (error instanceof AgentSteeringUnavailableError) {
        await this.queueSteeringFallback(payload, userMessage, providerConfig);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unknown steering error";
      this.runtime.emitAgentEvent({
        type: "error",
        sessionId: payload.session.id,
        message,
      });
    }
  }

  private async queueSteeringFallback(
    payload: SendSessionMessagePayload,
    userMessage: MessageRecord,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    await this.state.enqueueQueuedAgentInput({
      messageId: userMessage.id,
      sessionId: userMessage.sessionId,
      workspaceRootPath: payload.workspaceRootPath,
      thinkingLevel: payload.thinkingLevel,
      createdAt: userMessage.createdAt,
    });
    const queued = this.queuedFollowUps.get(payload.session.id) ?? [];
    queued.push({
      payload: {
        ...payload,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        delivery: "start-new-run",
      },
      providerConfig,
    });
    queued.sort((left, right) =>
      (left.payload.createdAt ?? "").localeCompare(
        right.payload.createdAt ?? "",
      ),
    );
    this.queuedFollowUps.set(payload.session.id, queued);
    if (!this.pendingTurns.has(payload.session.id)) {
      void this.startNextQueuedFollowUp(payload.session.id);
    }
  }
}

export function onAgentEvent(
  service: CocurdexDaemonService,
  listener: (event: AgentEvent) => void,
) {
  const daemonListener = (event: CocurdexDaemonEvent) => {
    if (event.type !== "data.changed" && !("conversationId" in event)) {
      listener(event);
    }
  };
  service.events.on("daemon.event", daemonListener);
  return () => {
    service.events.off("daemon.event", daemonListener);
  };
}

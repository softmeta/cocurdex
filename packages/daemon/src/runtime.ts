import { createAgentAdapter } from "@cocurdex/agent-adapters";
import type {
  AgentAdapter,
  AgentSession,
  RuntimeProviderConfig,
} from "@cocurdex/agent-core";
import {
  type AgentEvent,
  type AgentId,
  type AgentPermissionDecision,
  type AgentPermissionRequestPayload,
  type AgentPermissionRequestRecord,
  type AgentPlanApprovalDecision,
  type AgentPlanApprovalRecord,
  type AgentPlanApprovalRequestPayload,
  type AgentProviderSessionRecord,
  type AgentQuestionRequestPayload,
  type AgentQuestionRequestRecord,
  type AgentSessionConfigOption,
  type AgentSlashCommand,
  type AgentUsageRecord,
  type CreateSessionPayload,
  type MessageAttachment,
  type MessageRecord,
  mergeUsageRecords,
  type SendSessionMessagePayload,
  type SessionRecord,
} from "@cocurdex/shared";
import { createEventBroadcastCoalescer } from "./event-broadcast-coalescer";

export interface RuntimePersistence {
  providerSession: AgentProviderSessionRecord | null;
  providerConfig?: RuntimeProviderConfig | null;
  onProviderSessionUpdate(
    providerSession: AgentProviderSessionRecord | null,
  ): void;
}

interface SessionRuntime {
  session: SessionRecord;
  workspaceRootPath: string;
  runtime: AgentSession;
}

interface PendingPermission {
  request: AgentPermissionRequestRecord;
  resolve(decision: AgentPermissionDecision): void;
}

interface PendingQuestion {
  question: AgentQuestionRequestRecord;
  resolve(answer: string | null): void;
}

interface PendingPlanApproval {
  approval: AgentPlanApprovalRecord;
  resolve(decision: AgentPlanApprovalDecision): void;
}

interface AgentRuntimeManagerOptions {
  broadcastAgentEvent(event: AgentEvent): void;
  createAdapter?: (agentType: AgentId) => AgentAdapter;
  userDataPath?: string;
}

export class AgentRuntimeManager {
  private readonly activeTurnTrackers = new Map<
    string,
    {
      cancelled: boolean;
      messageId: string | null;
      usage: AgentUsageRecord | null;
    }
  >();
  private readonly broadcastCoalescer;
  private readonly createAdapter;
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly pendingPlanApprovals = new Map<
    string,
    PendingPlanApproval
  >();
  private readonly pendingQuestions = new Map<string, PendingQuestion>();
  private readonly sessionRuntimes = new Map<string, SessionRuntime>();
  private persistAgentEventHandler:
    | ((event: AgentEvent) => Promise<void> | void)
    | null = null;
  // Serialize persistence so events are written in emission order. Without
  // this queue, async writes can interleave and the DB sees out-of-order rows.
  private persistQueue: Promise<void> = Promise.resolve();

  private readonly userDataPath?: string;

  constructor(options: AgentRuntimeManagerOptions) {
    this.broadcastCoalescer = createEventBroadcastCoalescer(
      options.broadcastAgentEvent,
    );
    this.createAdapter = options.createAdapter ?? createAgentAdapter;
    this.userDataPath = options.userDataPath;
  }

  configureAgentEventPersistence(
    handler: (event: AgentEvent) => Promise<void> | void,
  ) {
    this.persistAgentEventHandler = handler;
  }

  getAgentSession(sessionId: string) {
    return this.sessionRuntimes.get(sessionId)?.runtime ?? null;
  }

  emitAgentEvent(event: AgentEvent) {
    if (
      event.type === "usage.updated" &&
      event.attribution !== "session-only"
    ) {
      const tracker = this.activeTurnTrackers.get(event.sessionId);
      if (tracker) {
        tracker.usage = this.addUsageRecords(tracker.usage, event.usage);
      }
    }
    if (
      event.type === "message.completed" &&
      event.message.role === "assistant"
    ) {
      const tracker = this.activeTurnTrackers.get(event.sessionId);
      if (tracker) {
        tracker.messageId = event.message.id;
      }
    }

    const handler = this.persistAgentEventHandler;
    if (!handler) {
      this.broadcastCoalescer.push(event);
      return;
    }

    const persistence = this.persistQueue.then(() => handler(event));
    this.persistQueue = persistence.catch((error) => {
      console.error("[AgentRuntimeManager] Failed to persist event", error);
    });
    void persistence.then(
      () => this.broadcastCoalescer.push(event),
      () => undefined,
    );
  }

  getSessionInteractions(sessionId: string) {
    return {
      permissions: Array.from(
        this.pendingPermissions.values(),
        ({ request }) => request,
      ).filter((request) => request.sessionId === sessionId),
      questions: Array.from(
        this.pendingQuestions.values(),
        ({ question }) => question,
      ).filter((question) => question.sessionId === sessionId),
      planApprovals: Array.from(
        this.pendingPlanApprovals.values(),
        ({ approval }) => approval,
      ).filter((approval) => approval.sessionId === sessionId),
    };
  }

  requestAgentPermission(
    request: AgentPermissionRequestPayload,
  ): Promise<AgentPermissionDecision> {
    const record = this.createPermissionRecord(request);

    return new Promise((resolve) => {
      this.pendingPermissions.set(record.id, { request: record, resolve });
      this.emitAgentEvent({
        type: "permission.requested",
        sessionId: record.sessionId,
        request: record,
      });
    });
  }

  resolveAgentPermission(requestId: string, decision: AgentPermissionDecision) {
    return this.resolvePendingPermission(requestId, decision);
  }

  requestAgentPlanApproval(
    request: AgentPlanApprovalRequestPayload,
  ): Promise<AgentPlanApprovalDecision> {
    const record = this.createPlanApprovalRecord(request);
    // A second approval for the same session means the agent re-parked a newer
    // plan. Retire the older one as "cancelled" so its promise never dangles
    // and the agent stays in plan mode for the new one.
    this.stalePendingPlanApprovalsForSession(record.sessionId);

    return new Promise((resolve) => {
      this.pendingPlanApprovals.set(record.id, { approval: record, resolve });
      this.emitAgentEvent({
        type: "plan.approval.requested",
        sessionId: record.sessionId,
        approval: record,
      });
    });
  }

  resolveAgentPlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ) {
    return this.resolvePendingPlanApproval(approvalId, decision, "resolved");
  }

  requestAgentQuestion(
    request: AgentQuestionRequestPayload,
  ): Promise<string | null> {
    const record = this.createQuestionRecord(request);

    return new Promise((resolve) => {
      this.pendingQuestions.set(record.id, { question: record, resolve });
      this.emitAgentEvent({
        type: "question.requested",
        sessionId: record.sessionId,
        question: record,
      });
    });
  }

  resolveAgentQuestion(questionId: string, answer: string) {
    const pending = this.pendingQuestions.get(questionId);

    if (!pending) {
      return false;
    }

    this.pendingQuestions.delete(questionId);
    const resolvedQuestion: AgentQuestionRequestRecord = {
      ...pending.question,
      answer,
      status: "answered",
      updatedAt: new Date().toISOString(),
    };

    this.emitAgentEvent({
      type: "question.resolved",
      sessionId: resolvedQuestion.sessionId,
      question: resolvedQuestion,
    });
    pending.resolve(answer);
    return true;
  }

  async listSessionSlashCommands(
    agentType: AgentId,
    workspaceRootPath: string,
  ): Promise<AgentSlashCommand[]> {
    const adapter = this.createAdapter(agentType);
    if (!adapter.listSlashCommands) {
      return [];
    }

    return adapter.listSlashCommands({
      workspaceRootPath,
      userDataPath: this.userDataPath,
    });
  }

  async setSessionRuntimeMode(sessionId: string, modeId: string) {
    const sessionRuntime = this.sessionRuntimes.get(sessionId);
    if (!sessionRuntime?.runtime.setMode) {
      throw new Error(`Session ${sessionId} does not support runtime modes`);
    }

    await sessionRuntime.runtime.setMode(modeId);
  }

  async setSessionTitle(sessionId: string, title: string) {
    const sessionRuntime = this.sessionRuntimes.get(sessionId);
    if (!sessionRuntime) {
      return;
    }

    sessionRuntime.session = { ...sessionRuntime.session, title };
    await sessionRuntime.runtime.setTitle?.(title);
  }

  async generateSessionTitle(sessionId: string, message: string) {
    const sessionRuntime = this.sessionRuntimes.get(sessionId);
    return sessionRuntime?.runtime.generateTitle?.(message) ?? null;
  }

  async setSessionRuntimeConfigOption(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ): Promise<AgentSessionConfigOption[]> {
    const sessionRuntime = this.sessionRuntimes.get(sessionId);
    if (!sessionRuntime?.runtime.setConfigOption) {
      throw new Error(
        `Session ${sessionId} does not support runtime configuration`,
      );
    }

    return sessionRuntime.runtime.setConfigOption(configId, value);
  }

  createSessionRuntime(
    payload: CreateSessionPayload,
    persistence: RuntimePersistence,
  ): SessionRuntime {
    const existingRuntime = this.sessionRuntimes.get(payload.session.id);

    if (existingRuntime) {
      // Replace the session reference instead of mutating it: callers and the
      // UI may hold onto the old object and rely on referential immutability.
      const updated: SessionRuntime = {
        ...existingRuntime,
        session: { ...existingRuntime.session, ...payload.session },
      };
      this.sessionRuntimes.set(payload.session.id, updated);
      return updated;
    }

    const adapter = this.createAdapter(payload.session.agentType);
    const sessionCopy = { ...payload.session };
    let runtime: AgentSession | null = null;
    const createdRuntime = adapter.createSession(
      {
        session: sessionCopy,
        workspaceRootPath: payload.workspaceRootPath,
        userDataPath: this.userDataPath,
        providerSession: persistence.providerSession,
        providerConfig: persistence.providerConfig,
        onProviderSessionUpdate: (providerSession) => {
          const activeRuntime = this.sessionRuntimes.get(payload.session.id);
          if (!runtime || activeRuntime?.runtime !== runtime) {
            return;
          }
          persistence.onProviderSessionUpdate(providerSession);
        },
        requestPermission: (request) => this.requestAgentPermission(request),
        requestQuestion: (request) => this.requestAgentQuestion(request),
        requestPlanApproval: (request) =>
          this.requestAgentPlanApproval(request),
      },
      (event) => {
        const activeRuntime = this.sessionRuntimes.get(payload.session.id);
        if (!runtime || activeRuntime?.runtime !== runtime) {
          return;
        }
        this.emitAgentEvent(event);
      },
    );
    runtime = createdRuntime;
    const nextRuntime: SessionRuntime = {
      session: sessionCopy,
      workspaceRootPath: payload.workspaceRootPath,
      runtime: createdRuntime,
    };

    this.sessionRuntimes.set(payload.session.id, nextRuntime);
    return nextRuntime;
  }

  async sendSessionMessage(
    payload: SendSessionMessagePayload,
    options: RuntimePersistence & { history: MessageRecord[] },
  ) {
    const isSteering = payload.delivery === "steer-active-run";
    if (this.activeTurnTrackers.has(payload.session.id) && !isSteering) {
      throw new Error(
        `Session ${payload.session.id} already has an active turn`,
      );
    }

    if (isSteering) {
      const sessionRuntime = this.ensureSessionRuntime(payload, options);
      return sessionRuntime.runtime.sendMessage({
        messageId: payload.messageId,
        content: payload.content,
        attachments: payload.attachments,
        history: options.history,
        thinkingLevel: payload.thinkingLevel,
        collaborationMode: payload.session.collaborationMode,
        permissionMode: payload.session.permissionMode,
        providerSnapshot: payload.session.providerSnapshot,
        providerConfig: options.providerConfig,
        delivery: payload.delivery,
      });
    }

    const startedAt = performance.now();
    const turnTracker = {
      cancelled: false,
      messageId: null as string | null,
      usage: null as AgentUsageRecord | null,
    };
    console.info("[AgentRuntimeManager] send message payload", {
      agentType: payload.session.agentType,
      attachments:
        payload.attachments?.map((attachment) =>
          this.summarizeAttachmentForLog(attachment),
        ) ?? [],
      contentLength: payload.content.length,
      createdAt: payload.createdAt ?? null,
      historyCount: options.history.length,
      messageId: payload.messageId ?? null,
      providerConfig: this.summarizeProviderConfigForLog(
        options.providerConfig,
      ),
      providerSessionId: options.providerSession?.providerSessionId ?? null,
      sessionId: payload.session.id,
      thinkingLevel: payload.thinkingLevel ?? null,
      workspaceRootPath: payload.workspaceRootPath,
    });
    this.activeTurnTrackers.set(payload.session.id, turnTracker);

    try {
      const sessionRuntime = this.ensureSessionRuntime(payload, options);
      const message = await sessionRuntime.runtime.sendMessage({
        messageId: payload.messageId,
        content: payload.content,
        attachments: payload.attachments,
        history: options.history,
        thinkingLevel: payload.thinkingLevel,
        collaborationMode: payload.session.collaborationMode,
        // Read off the incoming session, not the runtime's captured copy, so a
        // mid-session permission switch reaches the adapter.
        permissionMode: payload.session.permissionMode,
        providerSnapshot: payload.session.providerSnapshot,
        providerConfig: options.providerConfig,
        delivery: payload.delivery,
      });

      if (!turnTracker.cancelled && message.content.trim().length > 0) {
        this.emitAgentEvent({
          type: "turn.completed",
          sessionId: payload.session.id,
          messageId: turnTracker.messageId ?? message.id,
          durationMs: Math.round(performance.now() - startedAt),
          usage: turnTracker.usage ?? undefined,
          completedAt: new Date().toISOString(),
        });
      }

      return message;
    } finally {
      if (this.activeTurnTrackers.get(payload.session.id) === turnTracker) {
        this.activeTurnTrackers.delete(payload.session.id);
      }
    }
  }

  /**
   * Cancel the in-flight turn and leave the adapter session alive. Agents treat
   * their stop signal as "abandon this turn", not "end the conversation", so
   * disposing here would cost a full process respawn and provider session
   * reload on the very next message.
   */
  async cancelSessionTurn(sessionId: string) {
    this.clearPendingSessionWork(sessionId);
    const sessionRuntime = this.sessionRuntimes.get(sessionId);

    if (!sessionRuntime) {
      return false;
    }

    try {
      await sessionRuntime.runtime.stop();
    } finally {
      this.emitAgentEvent({
        type: "state.changed",
        sessionId,
        status: "idle",
      });
    }
    return true;
  }

  /** Tear the runtime down for good: session deletion, orchestration cancel, shutdown. */
  async disposeSessionRuntime(sessionId: string) {
    this.clearPendingSessionWork(sessionId);
    const sessionRuntime = this.sessionRuntimes.get(sessionId);

    if (!sessionRuntime) {
      return false;
    }

    this.sessionRuntimes.delete(sessionId);
    const failures: unknown[] = [];
    try {
      await sessionRuntime.runtime.stop();
    } catch (error) {
      failures.push(error);
    }
    try {
      await sessionRuntime.runtime.dispose();
    } catch (error) {
      failures.push(error);
    }
    this.emitAgentEvent({
      type: "state.changed",
      sessionId,
      status: "idle",
    });
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        `Failed to stop and dispose agent runtime ${sessionId}`,
      );
    }
    return true;
  }

  private clearPendingSessionWork(sessionId: string) {
    const turnTracker = this.activeTurnTrackers.get(sessionId);
    if (turnTracker) {
      turnTracker.cancelled = true;
      this.activeTurnTrackers.delete(sessionId);
    }
    this.denyPendingPermissionsForSession(sessionId);
    this.cancelPendingQuestionsForSession(sessionId);
    this.abandonPendingPlanApprovalsForSession(sessionId);
  }

  async shutdown() {
    const failures: unknown[] = [];
    for (const sessionId of Array.from(this.sessionRuntimes.keys())) {
      try {
        await this.disposeSessionRuntime(sessionId);
      } catch (error) {
        failures.push(error);
      }
    }
    await this.persistQueue;
    this.broadcastCoalescer.flush();
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "Failed to shut down agent runtimes");
    }
  }

  private createPermissionRecord(
    request: AgentPermissionRequestPayload,
  ): AgentPermissionRequestRecord {
    const now = new Date().toISOString();

    return {
      id: request.id ?? crypto.randomUUID(),
      sessionId: request.sessionId,
      providerId: request.providerId,
      kind: request.kind,
      title: request.title,
      description: request.description ?? null,
      rawInput: request.rawInput,
      locations: request.locations ?? [],
      options: request.options,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
  }

  private createPlanApprovalRecord(
    request: AgentPlanApprovalRequestPayload,
  ): AgentPlanApprovalRecord {
    const now = new Date().toISOString();

    return {
      id: request.id ?? crypto.randomUUID(),
      sessionId: request.sessionId,
      providerId: request.providerId,
      planContent: request.planContent,
      source: request.source,
      status: "pending",
      outcome: null,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private resolvePendingPlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
    status: Exclude<AgentPlanApprovalRecord["status"], "pending">,
  ) {
    const pending = this.pendingPlanApprovals.get(approvalId);

    if (!pending) {
      return false;
    }

    this.pendingPlanApprovals.delete(approvalId);
    const resolvedApproval: AgentPlanApprovalRecord = {
      ...pending.approval,
      status,
      outcome: decision.outcome,
      feedback: decision.feedback ?? null,
      updatedAt: new Date().toISOString(),
    };

    this.emitAgentEvent({
      type: "plan.approval.resolved",
      sessionId: resolvedApproval.sessionId,
      approval: resolvedApproval,
    });
    pending.resolve(decision);
    return true;
  }

  private stalePendingPlanApprovalsForSession(sessionId: string) {
    const approvalIds = Array.from(this.pendingPlanApprovals.values())
      .filter((pending) => pending.approval.sessionId === sessionId)
      .map((pending) => pending.approval.id);

    for (const approvalId of approvalIds) {
      this.resolvePendingPlanApproval(
        approvalId,
        { outcome: "cancelled" },
        "stale",
      );
    }
  }

  private abandonPendingPlanApprovalsForSession(sessionId: string) {
    const approvalIds = Array.from(this.pendingPlanApprovals.values())
      .filter((pending) => pending.approval.sessionId === sessionId)
      .map((pending) => pending.approval.id);

    for (const approvalId of approvalIds) {
      // Stopping the turn must not leave the agent waiting in plan mode, so
      // the parked approval answers "abandoned" rather than going unanswered.
      this.resolvePendingPlanApproval(
        approvalId,
        { outcome: "abandoned" },
        "resolved",
      );
    }
  }

  private createQuestionRecord(
    request: AgentQuestionRequestPayload,
  ): AgentQuestionRequestRecord {
    const now = new Date().toISOString();

    return {
      id: request.id ?? crypto.randomUUID(),
      sessionId: request.sessionId,
      providerId: request.providerId,
      question: request.question,
      ...(request.header ? { header: request.header } : {}),
      ...(request.options ? { options: request.options } : {}),
      ...(request.multiSelect !== undefined
        ? { multiSelect: request.multiSelect }
        : {}),
      status: "pending",
      answer: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private resolvePendingPermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ) {
    const pending = this.pendingPermissions.get(requestId);

    if (!pending) {
      return false;
    }

    this.pendingPermissions.delete(requestId);
    const now = new Date().toISOString();
    const resolvedRequest: AgentPermissionRequestRecord = {
      ...pending.request,
      status: decision.startsWith("allow") ? "allowed" : "denied",
      updatedAt: now,
    };

    this.emitAgentEvent({
      type: "permission.resolved",
      sessionId: resolvedRequest.sessionId,
      request: resolvedRequest,
      decision,
    });
    pending.resolve(decision);
    return true;
  }

  private denyPendingPermissionsForSession(sessionId: string) {
    const requestIds = Array.from(this.pendingPermissions.values())
      .filter((pending) => pending.request.sessionId === sessionId)
      .map((pending) => pending.request.id);

    for (const requestId of requestIds) {
      this.resolvePendingPermission(requestId, "reject_once");
    }
  }

  private cancelPendingQuestionsForSession(sessionId: string) {
    const questionIds = Array.from(this.pendingQuestions.values())
      .filter((pending) => pending.question.sessionId === sessionId)
      .map((pending) => pending.question.id);

    for (const questionId of questionIds) {
      const pending = this.pendingQuestions.get(questionId);
      this.pendingQuestions.delete(questionId);
      pending?.resolve(null);
    }
  }

  private ensureSessionRuntime(
    payload: Pick<SendSessionMessagePayload, "session" | "workspaceRootPath">,
    persistence: RuntimePersistence,
  ) {
    return this.createSessionRuntime(
      {
        session: payload.session,
        workspaceRootPath: payload.workspaceRootPath,
      },
      persistence,
    );
  }

  private summarizeAttachmentForLog(attachment: MessageAttachment) {
    if (attachment.kind === "image") {
      return {
        filePath: attachment.filePath,
        height: attachment.height,
        id: attachment.id,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        name: attachment.name,
        sizeBytes: attachment.sizeBytes,
        width: attachment.width,
      };
    }

    if (attachment.kind === "context-folder") {
      return {
        folderPath: attachment.folderPath,
        kind: attachment.kind,
      };
    }

    if (attachment.kind === "document") {
      return {
        filePath: attachment.filePath,
        id: attachment.id,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        name: attachment.name,
        sizeBytes: attachment.sizeBytes,
      };
    }

    return {
      endLine: attachment.endLine,
      filePath: attachment.filePath,
      kind: attachment.kind ?? "context-file",
      language: attachment.language,
      selectedTextLength: attachment.selectedText.length,
      startLine: attachment.startLine,
      surroundingContextLength: attachment.surroundingContext.length,
    };
  }

  private summarizeProviderConfigForLog(
    providerConfig: RuntimePersistence["providerConfig"],
  ) {
    if (!providerConfig) {
      return null;
    }

    return {
      api: providerConfig.api,
      baseUrl: providerConfig.baseUrl,
      hasApiKey: Boolean(providerConfig.apiKey),
      modelBaseUrl: providerConfig.modelBaseUrl ?? null,
      modelId: providerConfig.modelId,
      modelName: providerConfig.modelName,
      providerId: providerConfig.providerId,
      providerName: providerConfig.providerName,
      reasoningEffort: providerConfig.reasoningEffort ?? null,
      serviceTier: providerConfig.serviceTier ?? null,
      thinkingLevel: providerConfig.thinkingLevel ?? null,
      supportsReasoning: providerConfig.supportsReasoning ?? null,
    };
  }

  private addUsageRecords(
    current: AgentUsageRecord | null,
    delta: AgentUsageRecord,
  ): AgentUsageRecord {
    return mergeUsageRecords(current, delta);
  }
}

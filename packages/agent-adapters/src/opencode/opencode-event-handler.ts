import type {
  AgentEvent,
  AgentPermissionDecision,
  AgentToolCallRecord,
  AgentUsageRecord,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { QuestionRequest } from "@opencode-ai/sdk/v2";
import { createPermissionOptions } from "../shared";
import {
  getOpenCodeEventSessionId,
  type MessagePart,
  type MessagePartDeltaInfo,
  type OpenCodeMessageInfo,
  type OpenCodeMessageRole,
  type OpenCodeMessageSnapshot,
  type OpenCodeSessionInfo,
  type OpenCodeSessionSnapshot,
  type OpenCodeTextPartState,
  type PendingTextDelta,
} from "./opencode-events";
import type { OpenCodePermission } from "./opencode-permissions";
import {
  formatOpenCodeUserFacingError,
  getOpenCodeDatabaseSchemaMismatchColumn,
  isOpenCodeDatabaseSchemaMismatch,
  logOpenCode,
} from "./opencode-runtime";

interface OpenCodeEventHandlerOptions {
  sessionId: string;
  parentSession: SessionRecord;
  isDisposed: () => boolean;
  getOpenCodeSessionId: () => string | null;
  shouldAdoptOpenCodeSession?: (
    eventSessionId: string,
    eventType: string,
    parentSessionId?: string,
  ) => boolean;
  onOpenCodeSessionAdopted?: (eventSessionId: string) => void;
  onOpenCodeSessionEvent?: (eventSessionId: string) => void;
  onOpenCodeTurnSettled?: () => void;
  onEvent: (event: AgentEvent) => void;
  onPermissionUpdated?(permission: OpenCodePermission): void;
  onQuestionAsked?(question: QuestionRequest): void;
  resolveMessage?(messageId: string): Promise<OpenCodeMessageSnapshot | null>;
  resolveSession?(sessionId: string): Promise<OpenCodeSessionSnapshot | null>;
  resolveSessionInfo?(sessionId: string): Promise<OpenCodeSessionInfo | null>;
}

function dateFromOpenCodeTime(value: number | undefined, fallback: string) {
  return typeof value === "number" ? new Date(value).toISOString() : fallback;
}

function getToolOutput(part: MessagePart) {
  if (part.state?.status === "error") {
    return part.state.error ?? part.state.content ?? null;
  }

  return (
    part.state?.output ?? part.state?.content ?? part.state?.structured ?? null
  );
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

function isTaskTool(part: MessagePart) {
  return typeof part.tool === "string" && part.tool.toLowerCase() === "task";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function mapOpenCodeUsage(info: OpenCodeMessageInfo): AgentUsageRecord | null {
  if (!info.tokens) {
    return null;
  }

  const inputTokens = getTokenCount(info.tokens.input);
  const outputTokens = getTokenCount(info.tokens.output);
  const cacheReadInputTokens = getTokenCount(info.tokens.cache?.read);
  const cacheCreationInputTokens = getTokenCount(info.tokens.cache?.write);
  const reasoningOutputTokens = getTokenCount(info.tokens.reasoning);
  const reportedTotal = info.tokens.total;
  const contextTokensUsed =
    typeof reportedTotal === "number" &&
    Number.isFinite(reportedTotal) &&
    reportedTotal >= 0
      ? reportedTotal
      : inputTokens +
        outputTokens +
        cacheReadInputTokens +
        cacheCreationInputTokens;

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    reasoningOutputTokens,
    contextTokensUsed,
    totalCostUsd:
      typeof info.cost === "number" && Number.isFinite(info.cost)
        ? info.cost
        : undefined,
  };
}

function getSubagentInput(part: MessagePart) {
  if (part.type === "subtask") {
    return {
      command: part.command,
      description: part.description ?? "",
      prompt: part.prompt ?? "",
      subagent_type: part.agent ?? "general",
    };
  }

  const input = getRecord(part.state?.input);
  if (!input) {
    return null;
  }

  return input;
}

function getSubagentKey(part: MessagePart) {
  const input = getSubagentInput(part);
  if (!input) {
    return null;
  }

  const description =
    typeof input.description === "string" ? input.description : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const agent =
    typeof input.subagent_type === "string"
      ? input.subagent_type
      : typeof input.subagentType === "string"
        ? input.subagentType
        : "";

  return `${agent}\n${description}\n${prompt}`;
}

function getTaskSessionId(part: MessagePart) {
  if (!isTaskTool(part)) {
    return null;
  }

  const inputRecord = getRecord(part.state?.input);

  return (
    getMetadataString(part.state?.metadata, "sessionId") ??
    getMetadataString(part.state?.metadata, "sessionID") ??
    getMetadataString(inputRecord ?? undefined, "task_id") ??
    getMetadataString(inputRecord ?? undefined, "taskId")
  );
}

function getSubagentDescriptionFromTitle(title: string | undefined) {
  return title?.replace(/\s+\(@[^)]+ subagent\)$/, "").trim() || "";
}

function getSubagentTypeFromTitle(title: string | undefined) {
  const match = title?.match(/\(@([^)\s]+)\s+subagent\)$/);
  return match?.[1] ?? "general";
}

function getSubagentAppSessionId(
  parentSessionId: string,
  openCodeSessionId: string,
) {
  return `opencode-subagent:${parentSessionId}:${openCodeSessionId}`;
}

function mapToolStatus(
  status: string | undefined,
): AgentToolCallRecord["status"] {
  if (status === "running") {
    return "in_progress";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "error" || status === "failed") {
    return "failed";
  }

  if (status === "pending") {
    return "pending";
  }

  return "pending";
}

function mapSessionStatus(
  status: AgentToolCallRecord["status"],
): SessionRecord["status"] {
  if (status === "failed") {
    return "error";
  }

  if (status === "completed") {
    return "idle";
  }

  return "running";
}

function withSubagentSessionReference(
  rawInput: unknown,
  childSessionId: string,
  openCodeSessionId: string,
) {
  const input = getRecord(rawInput) ?? {};

  return {
    ...input,
    childSessionId,
    openCodeSessionId,
  };
}

function normalizeTextDelta(previousText: string, delta: string) {
  // OpenCode sometimes sends the full accumulated part text in `delta`.
  // Treat that as a snapshot-style update once the prefix is long enough to
  // avoid eating legitimate short token deltas that happen to share a prefix.
  if (previousText.length >= 16 && delta.startsWith(previousText)) {
    return delta.slice(previousText.length);
  }

  return delta;
}

function normalizeTextSnapshot(previousText: string, nextText: string) {
  if (!previousText) {
    return nextText;
  }

  if (!nextText.startsWith(previousText)) {
    return "";
  }

  const appendedText = nextText.slice(previousText.length);
  if (
    previousText.length >= 16 &&
    appendedText.length >= 16 &&
    previousText.startsWith(appendedText)
  ) {
    return "";
  }

  return appendedText;
}

export class OpenCodeEventHandler {
  private activeAssistantContent = "";
  private activeAssistantMessageId = "";
  private activeToolCalls = new Map<string, AgentToolCallRecord>();
  private messageRoles = new Map<string, OpenCodeMessageRole>();
  private messageTextPartIds = new Map<string, Set<string>>();
  private textParts = new Map<string, OpenCodeTextPartState>();
  private textPartContent = new Map<string, string>();
  private pendingTextDeltas = new Map<string, PendingTextDelta[]>();
  private resolvingMessages = new Set<string>();
  private snapshotRequestedMessages = new Set<string>();
  private usageEmittedMessageIds = new Set<string>();
  private subagentToolCalls = new Map<string, AgentToolCallRecord>();
  private subagentPlaceholderIds = new Map<string, string>();
  private resolvingSubagentSessions = new Set<string>();

  private getSubagentAppSessionId(openCodeSessionId: string) {
    return getSubagentAppSessionId(this.options.sessionId, openCodeSessionId);
  }

  private createSubagentSession(
    openCodeSessionId: string,
    toolCall: AgentToolCallRecord,
    info?: OpenCodeSessionInfo | null,
  ): SessionRecord {
    const parent = this.options.parentSession;
    const rawInput = getRecord(toolCall.rawInput);
    const description =
      getMetadataString(rawInput ?? undefined, "description") ||
      getSubagentDescriptionFromTitle(info?.title) ||
      "Subagent";
    const title = info?.title || description;

    return {
      id: this.getSubagentAppSessionId(openCodeSessionId),
      workspaceId: parent.workspaceId,
      title,
      agentType: parent.agentType,
      sessionKind: "subagent",
      parentSessionId: parent.id,
      parentToolCallId: toolCall.id,
      status: mapSessionStatus(toolCall.status),
      writeMode: parent.writeMode,
      collaborationMode: parent.collaborationMode,
      permissionMode: parent.permissionMode,
      providerSnapshot: parent.providerSnapshot ?? null,
      createdAt: toolCall.startedAt,
      updatedAt: toolCall.updatedAt,
      lastMessageAt: null,
      archivedAt: null,
    };
  }

  private emitSubagentSession(
    openCodeSessionId: string,
    toolCall: AgentToolCallRecord,
    info?: OpenCodeSessionInfo | null,
  ) {
    const session = this.createSubagentSession(
      openCodeSessionId,
      toolCall,
      info,
    );
    this.options.onEvent({
      type: "session.upserted",
      sessionId: session.id,
      session,
    });
    return session;
  }

  private emitSubagentSnapshot(
    openCodeSessionId: string,
    toolCall: AgentToolCallRecord,
    snapshot: OpenCodeSessionSnapshot,
    info?: OpenCodeSessionInfo | null,
  ) {
    const session = this.emitSubagentSession(openCodeSessionId, toolCall, info);
    const fallbackTime = new Date(Date.parse(toolCall.startedAt)).getTime();
    let order = 0;
    const nextTime = () => new Date(fallbackTime + order++).toISOString();

    for (const message of snapshot.messages) {
      const messageId = message.info?.id;
      const role = message.info?.role;
      if (!messageId || !role) {
        continue;
      }

      if (role === "user") {
        const text = this.getSubagentTextParts(message.parts, "text");
        if (!text) {
          continue;
        }

        this.emitSubagentMessage({
          id: `${session.id}:${messageId}:user`,
          sessionId: session.id,
          role: "user",
          content: text,
          attachments: [],
          createdAt: nextTime(),
        });
        continue;
      }

      this.emitSubagentAssistantParts(session.id, messageId, message.parts, {
        nextTime,
      });
    }

    this.emitSubagentSession(openCodeSessionId, toolCall, info);
  }

  private emitSubagentMessage(message: MessageRecord) {
    this.options.onEvent({
      type: "message.completed",
      sessionId: message.sessionId,
      message,
    });
  }

  private emitSubagentAssistantParts(
    sessionId: string,
    messageId: string,
    parts: MessagePart[],
    options: { nextTime: () => string },
  ) {
    let pendingText: {
      ids: string[];
      kind: "reasoning" | "response";
      values: string[];
    } | null = null;

    const flushText = () => {
      if (!pendingText) {
        return;
      }

      this.emitSubagentMessage({
        id: `${sessionId}:${messageId}:${pendingText.kind}:${pendingText.ids.join("-")}`,
        sessionId,
        role: "assistant",
        kind: pendingText.kind,
        content: pendingText.values.join("\n\n").trim(),
        attachments: [],
        createdAt: options.nextTime(),
      });
      pendingText = null;
    };

    for (const part of parts) {
      if (part.type === "text" || part.type === "reasoning") {
        const text = typeof part.text === "string" ? part.text.trim() : "";
        if (!text) {
          continue;
        }

        const kind = part.type === "reasoning" ? "reasoning" : "response";
        if (!pendingText || pendingText.kind !== kind) {
          flushText();
          pendingText = { ids: [], kind, values: [] };
        }
        pendingText.ids.push(part.id);
        pendingText.values.push(text);
        continue;
      }

      flushText();

      if (part.type !== "tool") {
        continue;
      }

      const startedAt = options.nextTime();
      const tool = this.getSubagentToolCall(sessionId, part, startedAt);
      this.options.onEvent({
        type:
          tool.status === "in_progress" || tool.status === "pending"
            ? "tool.started"
            : "tool.finished",
        sessionId,
        toolCall: tool,
      });
    }

    flushText();
  }

  private getSubagentTextParts(
    parts: MessagePart[],
    type: "reasoning" | "text",
  ) {
    return parts
      .filter((part) => part.type === type && typeof part.text === "string")
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  private getSubagentToolCall(
    sessionId: string,
    part: MessagePart,
    startedAt: string,
  ): AgentToolCallRecord {
    return {
      id: `${sessionId}:${part.id}`,
      sessionId,
      title: part.state?.title ?? part.tool ?? "tool",
      kind: part.tool ?? null,
      status: mapToolStatus(part.state?.status),
      content: [],
      rawInput: part.state?.input ?? part.state?.raw ?? null,
      rawOutput: getToolOutput(part),
      locations: [],
      startedAt,
      updatedAt: startedAt,
    };
  }
  private lastOpenCodeEventAt = 0;

  constructor(private readonly options: OpenCodeEventHandlerOptions) {}

  get lastEventAt() {
    return this.lastOpenCodeEventAt;
  }

  resetForMessage() {
    this.activeAssistantContent = "";
    this.activeAssistantMessageId = "";
    this.activeToolCalls = new Map();
    this.messageRoles = new Map();
    this.messageTextPartIds = new Map();
    this.textParts = new Map();
    this.textPartContent = new Map();
    this.pendingTextDeltas = new Map();
    this.resolvingMessages = new Set();
    this.snapshotRequestedMessages = new Set();
    this.subagentToolCalls = new Map();
    this.subagentPlaceholderIds = new Map();
    this.resolvingSubagentSessions = new Set();
  }

  handleEvent(raw: OpenCodeEvent) {
    const activeSessionId = this.options.getOpenCodeSessionId();
    if (this.options.isDisposed() || !activeSessionId) return;

    const { type, properties } = raw;
    const eventProperties = properties as Record<string, unknown>;
    const eventType = type as string;
    const eventSessionId = getOpenCodeEventSessionId(eventProperties);
    if (eventType !== "server.heartbeat") {
      logOpenCode("debug", "Event received", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: activeSessionId,
        eventSessionId: eventSessionId ?? null,
        type: eventType,
      });
    }

    if (eventSessionId && eventSessionId !== activeSessionId) {
      if (this.subagentToolCalls.has(eventSessionId)) {
        this.lastOpenCodeEventAt = Date.now();
        this.options.onOpenCodeSessionEvent?.(eventSessionId);
        this.handleSubagentSessionStatus(eventSessionId, eventType, {
          status: eventProperties.status,
        });
        void this.resolveSubagentSession(eventSessionId, {
          reason: eventType,
        });
        return;
      }

      void this.handleForeignSessionEvent(eventSessionId, eventType);
      return;
    }

    this.lastOpenCodeEventAt = Date.now();
    if (eventSessionId) {
      this.options.onOpenCodeSessionEvent?.(eventSessionId);
    }

    if (
      eventSessionId &&
      eventSessionId !== this.options.getOpenCodeSessionId()
    ) {
      logOpenCode("debug", "Event ignored for different session", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        eventSessionId,
        type: eventType,
      });
      return;
    }

    switch (eventType) {
      case "message.updated":
        this.handleMessageUpdated(eventProperties.info as OpenCodeMessageInfo);
        break;

      case "message.part.updated":
        this.handleMessagePartUpdated(eventProperties);
        break;

      case "message.part.delta":
        this.handleTextPartDelta(eventProperties as MessagePartDeltaInfo);
        break;

      case "session.status":
        this.handleSessionStatus(eventProperties.status as { type: string });
        break;

      case "session.idle":
        logOpenCode("debug", "session.idle received", {
          appSessionId: this.options.sessionId,
          contentLength: this.activeAssistantContent.length,
          activeToolCalls: this.activeToolCalls.size,
          subagentToolCalls: this.subagentToolCalls.size,
        });
        this.flushAssistantMessage("session.idle");
        this.emitStateChanged("idle");
        this.options.onOpenCodeTurnSettled?.();
        break;

      case "session.error":
        this.handleSessionError(eventProperties.error);
        this.options.onOpenCodeTurnSettled?.();
        break;

      case "permission.updated":
        this.options.onPermissionUpdated?.(
          eventProperties as unknown as OpenCodePermission,
        );
        break;

      case "question.asked":
        this.options.onQuestionAsked?.(
          eventProperties as unknown as QuestionRequest,
        );
        break;

      case "permission.replied":
        this.handlePermissionReplied(eventProperties);
        break;
    }
  }

  private handlePermissionReplied(eventProperties: Record<string, unknown>) {
    const permissionID =
      typeof eventProperties.permissionID === "string"
        ? eventProperties.permissionID
        : null;
    const response =
      typeof eventProperties.response === "string"
        ? eventProperties.response
        : null;

    if (!permissionID || !response) {
      return;
    }

    const decision: AgentPermissionDecision =
      response === "reject"
        ? "reject_once"
        : response === "always"
          ? "allow_always"
          : "allow_once";
    const now = new Date().toISOString();

    this.options.onEvent({
      type: "permission.resolved",
      sessionId: this.options.sessionId,
      decision,
      request: {
        id: permissionID,
        sessionId: this.options.sessionId,
        providerId: "opencode",
        kind: "opencode",
        title: permissionID,
        description: null,
        rawInput: eventProperties,
        locations: [],
        options: createPermissionOptions([
          "reject_once",
          "allow_always",
          "allow_once",
        ]),
        status: decision.startsWith("allow") ? "allowed" : "denied",
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  private handleMessagePartUpdated(eventProperties: Record<string, unknown>) {
    const part = eventProperties.part as MessagePart;
    const delta = eventProperties.delta as string | undefined;

    if (part.type === "text" || part.type === "reasoning") {
      this.upsertTextPart(part);
      this.handleTextPart(part, delta);
      if (
        this.pendingTextDeltas.has(part.id) &&
        !this.messageRoles.has(part.messageID ?? part.id)
      ) {
        this.messageRoles.set(part.messageID ?? part.id, "assistant");
      }
      this.flushPendingTextDeltas(part.id);
      return;
    }

    if (part.type === "tool" && part.state) {
      this.emitToolPart(part);
      return;
    }

    if (part.type === "subtask") {
      logOpenCode("info", "Subtask part received", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        partId: part.id,
        messageId: part.messageID,
        agent: part.agent ?? null,
        description: part.description ?? null,
      });
      this.emitSubtaskPart(part);
    }
  }

  private emitSubtaskPart(part: MessagePart) {
    const key = getSubagentKey(part);
    if (key) {
      this.subagentPlaceholderIds.set(key, part.id);
    }

    const now = new Date().toISOString();
    const rawInput = getSubagentInput(part);
    const toolCall: AgentToolCallRecord = {
      id: part.id,
      sessionId: this.options.sessionId,
      title: "Using subagent",
      kind: "task",
      status: "in_progress",
      content: [],
      rawInput,
      rawOutput: null,
      locations: [],
      startedAt: now,
      updatedAt: now,
    };

    this.activeToolCalls.set(toolCall.id, toolCall);
    logOpenCode("info", "Subtask placeholder emitted", {
      appSessionId: this.options.sessionId,
      openCodeSessionId: this.options.getOpenCodeSessionId(),
      toolCallId: toolCall.id,
      subagentType: getMetadataString(
        getRecord(toolCall.rawInput) ?? undefined,
        "subagent_type",
      ),
      description: getMetadataString(
        getRecord(toolCall.rawInput) ?? undefined,
        "description",
      ),
    });
    this.options.onEvent({
      type: "tool.started",
      sessionId: this.options.sessionId,
      toolCall,
    });
  }

  private emitChildSessionPlaceholder(info: OpenCodeSessionInfo) {
    const activeSessionId = this.options.getOpenCodeSessionId();
    if (!activeSessionId || info.parentID !== activeSessionId) {
      return false;
    }

    const existing = this.subagentToolCalls.get(info.id);
    if (existing) {
      return true;
    }

    const description = getSubagentDescriptionFromTitle(info.title);
    const now = new Date().toISOString();
    const appChildSessionId = this.getSubagentAppSessionId(info.id);
    const toolCall: AgentToolCallRecord = {
      id: `opencode-subagent-${info.id}`,
      sessionId: this.options.sessionId,
      title: "Using subagent",
      kind: "task",
      status: "in_progress",
      subagent: {
        sessionId: appChildSessionId,
        type: getSubagentTypeFromTitle(info.title),
        description: description || "Subagent",
      },
      content: [],
      rawInput: {
        description,
        prompt: "",
        subagent_type: getSubagentTypeFromTitle(info.title),
        childSessionId: appChildSessionId,
        openCodeSessionId: info.id,
      },
      rawOutput: null,
      locations: [],
      startedAt: now,
      updatedAt: now,
    };

    this.subagentToolCalls.set(info.id, toolCall);
    this.activeToolCalls.set(toolCall.id, toolCall);
    this.emitSubagentSession(info.id, toolCall, info);
    logOpenCode("info", "Child session placeholder emitted", {
      appSessionId: this.options.sessionId,
      openCodeSessionId: activeSessionId,
      childSessionId: info.id,
      toolCallId: toolCall.id,
      title: info.title ?? null,
      description,
    });
    this.options.onEvent({
      type: "tool.started",
      sessionId: this.options.sessionId,
      toolCall,
    });
    void this.resolveSubagentSession(info.id, {
      reason: "child.session.detected",
    });
    return true;
  }

  private async handleForeignSessionEvent(
    eventSessionId: string,
    eventType: string,
  ) {
    try {
      logOpenCode("info", "Foreign OpenCode session event observed", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        eventSessionId,
        type: eventType,
      });
      const info = await this.options.resolveSessionInfo?.(eventSessionId);
      if (this.options.isDisposed()) {
        return;
      }

      if (info && this.emitChildSessionPlaceholder(info)) {
        this.lastOpenCodeEventAt = Date.now();
        this.options.onOpenCodeSessionEvent?.(eventSessionId);
        logOpenCode("debug", "Child session event mapped to subagent", {
          appSessionId: this.options.sessionId,
          openCodeSessionId: this.options.getOpenCodeSessionId(),
          childSessionId: eventSessionId,
          type: eventType,
        });
        return;
      }

      if (
        this.options.shouldAdoptOpenCodeSession?.(
          eventSessionId,
          eventType,
          info?.parentID,
        )
      ) {
        logOpenCode("warn", "Adopting OpenCode event session", {
          appSessionId: this.options.sessionId,
          previousOpenCodeSessionId: this.options.getOpenCodeSessionId(),
          nextOpenCodeSessionId: eventSessionId,
          type: eventType,
        });
        this.options.onOpenCodeSessionAdopted?.(eventSessionId);
        return;
      }

      logOpenCode("debug", "Event ignored for different session", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        eventSessionId,
        type: eventType,
      });
    } catch (error) {
      logOpenCode("debug", "Foreign session handling failed", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        eventSessionId,
        type: eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleSubagentSessionStatus(
    openCodeSessionId: string,
    eventType: string,
    eventProperties: { status?: unknown },
  ) {
    const current = this.subagentToolCalls.get(openCodeSessionId);
    if (!current) {
      return;
    }

    const statusRecord = getRecord(eventProperties.status);
    const statusType =
      typeof statusRecord?.type === "string" ? statusRecord.type : null;
    const nextStatus =
      eventType === "session.idle" || statusType === "idle"
        ? "completed"
        : statusType === "busy"
          ? "in_progress"
          : null;

    if (!nextStatus || current.status === nextStatus) {
      return;
    }

    const nextToolCall: AgentToolCallRecord = {
      ...current,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    this.subagentToolCalls.set(openCodeSessionId, nextToolCall);
    this.activeToolCalls.set(nextToolCall.id, nextToolCall);
    this.emitSubagentSession(openCodeSessionId, nextToolCall);
    this.options.onEvent({
      type: nextStatus === "completed" ? "tool.finished" : "tool.started",
      sessionId: this.options.sessionId,
      toolCall: nextToolCall,
    });
  }

  private emitToolPart(part: MessagePart) {
    const isSubagentTask = isTaskTool(part);
    const subagentKey = isSubagentTask ? getSubagentKey(part) : null;
    const toolCallId =
      (subagentKey ? this.subagentPlaceholderIds.get(subagentKey) : null) ??
      part.id;
    const existingToolCall = this.activeToolCalls.get(toolCallId);
    const childSessionId = getTaskSessionId(part);
    if (isSubagentTask) {
      logOpenCode("info", "Task tool part received", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        partId: part.id,
        messageId: part.messageID,
        childSessionId,
        status: part.state?.status,
        input: getSubagentInput(part),
      });
    }
    const status = mapToolStatus(part.state?.status);

    const now = new Date().toISOString();
    const startedAt =
      existingToolCall?.startedAt ??
      dateFromOpenCodeTime(part.state?.time?.start, now);
    const updatedAt = dateFromOpenCodeTime(part.state?.time?.end, now);
    const title =
      part.state?.title ??
      (typeof part.tool === "string" ? part.tool : "Unknown");
    const appChildSessionId = childSessionId
      ? this.getSubagentAppSessionId(childSessionId)
      : null;
    const rawInput =
      isSubagentTask && childSessionId && appChildSessionId
        ? withSubagentSessionReference(
            getSubagentInput(part) ?? part.state?.raw ?? null,
            appChildSessionId,
            childSessionId,
          )
        : (part.state?.input ?? part.state?.raw ?? null);
    const toolCall: AgentToolCallRecord = {
      id: toolCallId,
      sessionId: this.options.sessionId,
      title: isSubagentTask ? "Using subagent" : title,
      kind: typeof part.tool === "string" ? part.tool.toLowerCase() : null,
      status,
      subagent:
        isSubagentTask && appChildSessionId
          ? {
              sessionId: appChildSessionId,
              type:
                getMetadataString(
                  getRecord(rawInput) ?? undefined,
                  "subagent_type",
                ) ?? null,
              description:
                getMetadataString(
                  getRecord(rawInput) ?? undefined,
                  "description",
                ) || "Subagent",
            }
          : null,
      content: [],
      rawInput,
      rawOutput: isSubagentTask ? null : getToolOutput(part),
      locations: [],
      startedAt,
      updatedAt,
    };

    this.activeToolCalls.set(toolCall.id, toolCall);
    if (childSessionId) {
      this.subagentToolCalls.set(childSessionId, toolCall);
      this.emitSubagentSession(childSessionId, toolCall);
    }
    logOpenCode("debug", "Tool part emitted", {
      appSessionId: this.options.sessionId,
      openCodeSessionId: this.options.getOpenCodeSessionId(),
      toolCallId: toolCall.id,
      toolName: toolCall.title,
      status: toolCall.status,
      eventType:
        status === "in_progress" || status === "pending"
          ? "tool.started"
          : "tool.finished",
    });
    this.options.onEvent({
      type:
        status === "in_progress" || status === "pending"
          ? "tool.started"
          : "tool.finished",
      sessionId: this.options.sessionId,
      toolCall,
    });

    if (childSessionId) {
      void this.resolveSubagentSession(childSessionId, {
        reason: "task.tool.part",
      });
    }
  }

  private async resolveSubagentSession(
    childSessionId: string,
    options: { reason: string },
  ) {
    const toolCall = this.subagentToolCalls.get(childSessionId);
    if (
      !toolCall ||
      this.resolvingSubagentSessions.has(childSessionId) ||
      !this.options.resolveSession
    ) {
      return;
    }

    this.resolvingSubagentSessions.add(childSessionId);
    try {
      logOpenCode("debug", "Resolving subagent session snapshot", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        childSessionId,
        reason: options.reason,
      });
      const snapshot = await this.options.resolveSession(childSessionId);
      if (!snapshot || this.options.isDisposed()) {
        return;
      }

      const current = this.subagentToolCalls.get(childSessionId) ?? toolCall;
      const info = await this.options.resolveSessionInfo?.(childSessionId);
      const appChildSessionId = this.getSubagentAppSessionId(childSessionId);
      const hydratedToolCall: AgentToolCallRecord = {
        ...current,
        rawInput: withSubagentSessionReference(
          current.rawInput,
          appChildSessionId,
          childSessionId,
        ),
        rawOutput: null,
        updatedAt: new Date().toISOString(),
      };
      this.subagentToolCalls.set(childSessionId, hydratedToolCall);
      this.activeToolCalls.set(hydratedToolCall.id, hydratedToolCall);
      this.emitSubagentSnapshot(
        childSessionId,
        hydratedToolCall,
        snapshot,
        info,
      );
      this.options.onEvent({
        type:
          hydratedToolCall.status === "in_progress" ||
          hydratedToolCall.status === "pending"
            ? "tool.started"
            : "tool.finished",
        sessionId: this.options.sessionId,
        toolCall: hydratedToolCall,
      });
    } catch (error) {
      logOpenCode("warn", "Subagent session snapshot resolve failed", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        childSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.resolvingSubagentSessions.delete(childSessionId);
    }
  }

  private handleSessionStatus(status: { type: string }) {
    const activeSessionId = this.options.getOpenCodeSessionId();

    if (status.type === "busy") {
      logOpenCode("info", "Session status busy", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: activeSessionId,
      });
      this.emitStateChanged("running");
      return;
    }

    if (status.type === "retry") {
      logOpenCode("info", "Session retrying", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: activeSessionId,
      });
      this.emitStateChanged("running");
      return;
    }

    if (status.type === "idle") {
      if (this.activeAssistantMessageId) {
        void this.resolveMessageSnapshot(this.activeAssistantMessageId, {
          force: true,
          reason: `session.status.${status.type}`,
        });
      }

      logOpenCode("info", "Session status not busy", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: activeSessionId,
        status: status.type,
      });
      this.flushAssistantMessage("session.status.idle");
      this.emitStateChanged("idle");
      this.options.onOpenCodeTurnSettled?.();
    }
  }

  private flushAssistantMessage(reason: string) {
    if (!this.activeAssistantMessageId || !this.activeAssistantContent) {
      // No assistant text to emit at flush time. When this fires on
      // session.idle/completed it is the exact point where a turn ends with no
      // reply: tools ran but the model produced no final text (or its text was
      // never captured). Capture the outstanding state so packaged-only repros
      // are diagnosable.
      logOpenCode("debug", "Assistant flush skipped (no content)", {
        appSessionId: this.options.sessionId,
        reason,
        hasMessageId: Boolean(this.activeAssistantMessageId),
        contentLength: this.activeAssistantContent.length,
        activeToolCalls: this.activeToolCalls.size,
        subagentToolCalls: this.subagentToolCalls.size,
      });
      return;
    }

    logOpenCode("info", "Assistant message completed", {
      appSessionId: this.options.sessionId,
      openCodeSessionId: this.options.getOpenCodeSessionId(),
      messageId: this.activeAssistantMessageId,
      contentLength: this.activeAssistantContent.length,
      reason,
    });

    this.options.onEvent({
      type: "message.completed",
      sessionId: this.options.sessionId,
      message: {
        id: this.activeAssistantMessageId,
        sessionId: this.options.sessionId,
        role: "assistant",
        kind: "response",
        content: this.activeAssistantContent,
        attachments: [],
        createdAt: new Date().toISOString(),
      },
    });
    this.activeAssistantMessageId = "";
    this.activeAssistantContent = "";
  }

  private emitContentPartDelta(part: MessagePart, delta?: string) {
    if (
      (part.type !== "text" && part.type !== "reasoning") ||
      typeof part.text !== "string"
    ) {
      return;
    }

    const messageId = part.messageID ?? part.id;
    const renderedMessageId = this.getRenderedMessageId(part);
    const previousText = this.textPartContent.get(part.id) ?? "";
    const nextText = part.text;
    const textDelta = delta
      ? normalizeTextDelta(previousText, delta)
      : normalizeTextSnapshot(previousText, nextText);
    this.textPartContent.set(part.id, nextText);

    if (!textDelta || (!delta && !nextText.startsWith(previousText))) {
      return;
    }

    if (part.type === "text" && !this.activeAssistantMessageId) {
      this.activeAssistantMessageId = messageId;
    }

    if (part.type === "text" && this.activeAssistantMessageId !== messageId) {
      this.flushAssistantMessage("assistant.message.changed");
      this.activeAssistantMessageId = messageId;
    }

    if (part.type === "text") {
      this.activeAssistantContent += textDelta;
    }

    logOpenCode("debug", "Text delta emitted", {
      appSessionId: this.options.sessionId,
      openCodeSessionId: this.options.getOpenCodeSessionId(),
      messageId: renderedMessageId,
      partType: part.type,
      deltaLength: textDelta.length,
      totalLength: this.activeAssistantContent.length,
    });
    this.options.onEvent({
      type: "message.delta",
      sessionId: this.options.sessionId,
      messageId: renderedMessageId,
      role: "assistant",
      kind: part.type === "reasoning" ? "reasoning" : "response",
      delta: textDelta,
      createdAt: new Date().toISOString(),
    });
  }

  private handleTextPart(part: MessagePart, delta?: string) {
    const messageId = part.messageID ?? part.id;
    const role = this.messageRoles.get(messageId);

    if (!role) {
      return;
    }

    if (role === "assistant") {
      this.emitContentPartDelta(part, delta);
    }
  }

  private handleTextPartDelta(info: MessagePartDeltaInfo) {
    if (info.field !== "text" || typeof info.delta !== "string") {
      return;
    }

    const messageId = info.messageID ?? info.part?.messageID;
    const partId = info.partID ?? info.part?.id;
    if (!messageId || !partId) {
      return;
    }

    void this.resolveMessageSnapshot(messageId, {
      force: false,
      reason: "message.part.delta",
    });

    if (info.part?.type === "text" || info.part?.type === "reasoning") {
      this.upsertTextPart(info.part);
    }

    const part = this.textParts.get(partId)?.part;
    if (!part) {
      const pending = this.pendingTextDeltas.get(partId) ?? [];
      pending.push({
        delta: info.delta,
        messageId,
        partId,
        sessionId: info.sessionID ?? info.part?.sessionID,
      });
      this.pendingTextDeltas.set(partId, pending);

      if (info.type === "text" || info.type === "reasoning") {
        this.flushPendingTextDeltasAs(partId, info.type);
      } else {
        void this.resolveMessageSnapshot(messageId, {
          force: true,
          reason: "missing.part.metadata",
        });
      }
      return;
    }

    this.handleTextPartDeltaWithType({
      delta: info.delta,
      messageId,
      partId,
      partType: part.type,
      sessionId: info.sessionID ?? info.part?.sessionID,
    });
  }

  private handleTextPartDeltaWithType({
    delta,
    messageId,
    partId,
    partType,
    sessionId,
  }: PendingTextDelta & { partType: string }) {
    const previousText = this.textPartContent.get(partId) ?? "";
    const textDelta = normalizeTextDelta(previousText, delta);
    this.handleTextPart(
      {
        id: partId,
        messageID: messageId,
        sessionID: sessionId,
        type: partType,
        text: `${previousText}${textDelta}`,
      },
      textDelta,
    );
  }

  private flushPendingTextDeltas(partId: string) {
    const pending = this.pendingTextDeltas.get(partId);
    if (!pending) {
      return;
    }

    const partState = this.textParts.get(partId);
    if (!partState) {
      return;
    }

    const role = this.messageRoles.get(partState.messageId);
    if (!role) {
      return;
    }

    this.pendingTextDeltas.delete(partId);

    if (role !== "assistant") {
      return;
    }

    const currentText = this.textPartContent.get(partId) ?? "";
    const pendingText = pending
      .map((pendingDelta) => pendingDelta.delta)
      .join("");
    if (pendingText && currentText.includes(pendingText)) {
      return;
    }

    for (const pendingDelta of pending) {
      this.handleTextPartDeltaWithType({
        ...pendingDelta,
        partType: partState.part.type,
        sessionId: pendingDelta.sessionId ?? partState.part.sessionID,
      });
    }
  }

  private async resolveMessageSnapshot(
    messageId: string,
    options: { force: boolean; reason: string },
  ) {
    if (this.resolvingMessages.has(messageId) || !this.options.resolveMessage) {
      return;
    }

    if (!options.force && this.snapshotRequestedMessages.has(messageId)) {
      return;
    }

    this.snapshotRequestedMessages.add(messageId);
    this.resolvingMessages.add(messageId);
    try {
      logOpenCode("debug", "Resolving message snapshot", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        messageId,
        reason: options.reason,
      });
      const snapshot = await this.options.resolveMessage(messageId);
      if (!snapshot || this.options.isDisposed()) {
        return;
      }

      if (snapshot.info) {
        this.handleMessageUpdated(snapshot.info);
      }

      for (const part of snapshot.parts) {
        this.handleMessagePartUpdated({ part });
      }
    } catch (error) {
      logOpenCode("warn", "Message snapshot resolve failed", {
        appSessionId: this.options.sessionId,
        openCodeSessionId: this.options.getOpenCodeSessionId(),
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.resolvingMessages.delete(messageId);
    }
  }

  private flushPendingTextDeltasAs(
    partId: string,
    partType: "reasoning" | "text",
  ) {
    const pending = this.pendingTextDeltas.get(partId);
    if (!pending?.length) {
      return;
    }

    const first = pending[0];
    if (!first) {
      return;
    }

    this.messageRoles.set(first.messageId, "assistant");
    this.upsertTextPart({
      id: partId,
      messageID: first.messageId,
      sessionID: first.sessionId,
      text: "",
      type: partType,
    });
    this.flushPendingTextDeltas(partId);
  }

  private upsertTextPart(part: MessagePart) {
    const messageId = part.messageID ?? part.id;
    this.textParts.set(part.id, { messageId, part });

    const partIds = this.messageTextPartIds.get(messageId) ?? new Set();
    partIds.add(part.id);
    this.messageTextPartIds.set(messageId, partIds);
  }

  private handleMessageUpdated(info: OpenCodeMessageInfo) {
    if (!info.id || !info.role) {
      return;
    }

    this.messageRoles.set(info.id, info.role);

    if (info.role !== "assistant") {
      const partIds = this.messageTextPartIds.get(info.id);
      if (partIds) {
        for (const partId of partIds) {
          this.pendingTextDeltas.delete(partId);
        }
      }
      return;
    }

    if (
      info.time?.completed != null &&
      !this.usageEmittedMessageIds.has(info.id)
    ) {
      const usage = mapOpenCodeUsage(info);
      if (usage) {
        this.usageEmittedMessageIds.add(info.id);
        this.options.onEvent({
          type: "usage.updated",
          sessionId: this.options.sessionId,
          usage,
          receivedAt: new Date().toISOString(),
        });
      }
    }

    const partIds = this.messageTextPartIds.get(info.id);
    if (partIds) {
      for (const partId of partIds) {
        const part = this.textParts.get(partId)?.part;
        if (part) {
          this.handleTextPart(part);
        }
        this.flushPendingTextDeltas(partId);
      }
    }
  }

  private getRenderedMessageId(part: MessagePart) {
    const messageId = part.messageID ?? part.id;
    return part.type === "reasoning"
      ? `${messageId}:reasoning:${part.id}`
      : messageId;
  }

  // OpenCode reports model/provider failures via `session.error` rather than a
  // failed assistant message. Without handling it the session would stay stuck
  // in "running" with no feedback. User-initiated aborts arrive here too and
  // are not real errors, so they are swallowed.
  private handleSessionError(error: unknown) {
    const record = getRecord(error);
    const name = typeof record?.name === "string" ? record.name : null;

    if (name === "MessageAbortedError") {
      return;
    }

    const data = getRecord(record?.data);
    const detail =
      typeof data?.message === "string" && data.message ? data.message : null;
    const providerId =
      typeof data?.providerID === "string" && data.providerID
        ? data.providerID
        : null;

    const label = name ?? "OpenCodeError";
    const scope = providerId ? ` (${providerId})` : "";
    let message = `${label}${scope}`;
    if (detail) {
      const userFacingDetail = formatOpenCodeUserFacingError(detail);
      message = isOpenCodeDatabaseSchemaMismatch(detail)
        ? userFacingDetail
        : `${label}${scope}: ${userFacingDetail}`;
    }

    logOpenCode("error", "Session error received", {
      appSessionId: this.options.sessionId,
      databaseSchemaMismatch: isOpenCodeDatabaseSchemaMismatch(detail),
      missingColumn: isOpenCodeDatabaseSchemaMismatch(detail)
        ? getOpenCodeDatabaseSchemaMismatchColumn(detail)
        : null,
      openCodeSessionId: this.options.getOpenCodeSessionId(),
      name,
      providerId,
      message,
    });

    this.flushAssistantMessage("session.error");
    this.options.onEvent({
      type: "error",
      sessionId: this.options.sessionId,
      message,
    });
    this.emitStateChanged("error");
  }

  private emitStateChanged(status: "error" | "idle" | "running") {
    this.options.onEvent({
      type: "state.changed",
      sessionId: this.options.sessionId,
      status,
    });
  }
}

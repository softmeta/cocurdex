import type {
  AgentEvent,
  AgentToolCallRecord,
  AgentUsageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import type {
  FormCreated,
  OpenCodeEvent,
  SessionStructuredError,
  TokenUsageInfo,
  ToolContent1,
} from "@opencode/client";
import { createPermissionOptions } from "../shared";
import {
  mapOpenCodeReply,
  type OpenCodePermission,
} from "./opencode-permissions";

export type OpenCodeTurnOutcome = "failed" | "interrupted" | "succeeded";

export type OpenCodeForm = FormCreated["data"]["form"];

interface OpenCodeTurnOptions {
  sessionId: string;
  parentSession: SessionRecord;
  openCodeSessionId: string;
  promptId: string;
  onEvent(event: AgentEvent): void;
  onPermissionAsked(permission: OpenCodePermission): void;
  onFormCreated(form: OpenCodeForm): void;
  onTitle(title: string): void;
}

interface ToolState {
  name: string;
  record: AgentToolCallRecord;
}

interface ChildState {
  appSessionId: string;
  title: string | null;
  toolKey: string | null;
}

const SUBAGENT_TOOL = "subagent";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : null;
}

function getEventSessionId(event: OpenCodeEvent) {
  if (event.type === "form.created") return event.data.form.sessionID;
  const data = getRecord(event.data);
  return getString(data, "sessionID");
}

function toolContentText(content: ReadonlyArray<ToolContent1> | undefined) {
  const text = (content ?? [])
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .join("\n");
  return text || null;
}

function mapUsage(tokens: TokenUsageInfo, cost: number): AgentUsageRecord {
  return {
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheReadInputTokens: tokens.cache.read,
    cacheCreationInputTokens: tokens.cache.write,
    reasoningOutputTokens: tokens.reasoning,
    contextTokensUsed:
      tokens.input + tokens.output + tokens.cache.read + tokens.cache.write,
    totalCostUsd: Number.isFinite(cost) ? cost : undefined,
  };
}

export function formatOpenCodeExecutionError(error: SessionStructuredError) {
  return error.message ? `${error.type}: ${error.message}` : error.type;
}

function mapChildStatus(
  status: AgentToolCallRecord["status"],
): SessionRecord["status"] {
  if (status === "failed") return "error";
  if (status === "completed") return "idle";
  return "running";
}

export class OpenCodeTurn {
  private started = false;
  private assistantMessageId = "";
  private assistantContent = "";
  private readonly tools = new Map<string, ToolState>();
  private readonly children = new Map<string, ChildState>();

  constructor(private readonly options: OpenCodeTurnOptions) {}

  get hasStarted() {
    return this.started;
  }

  handle(event: OpenCodeEvent): OpenCodeTurnOutcome | null {
    const root = this.options.openCodeSessionId;
    if (event.type === "session.created") {
      if (event.data.parentID === root) {
        this.children.set(event.data.sessionID, {
          appSessionId: `opencode-subagent:${this.options.sessionId}:${event.data.sessionID}`,
          title: event.data.title ?? null,
          toolKey: null,
        });
      }
      return null;
    }

    const eventSessionId = getEventSessionId(event);
    if (!eventSessionId) return null;
    const child = this.children.get(eventSessionId);
    if (eventSessionId !== root && !child) return null;

    switch (event.type) {
      case "permission.asked":
        this.options.onPermissionAsked(event.data);
        return null;
      case "form.created":
        this.options.onFormCreated(event.data.form);
        return null;
      case "permission.replied":
        this.emitPermissionResolved(event);
        return null;
      case "session.renamed":
        if (!child) this.options.onTitle(event.data.title);
        return null;
    }

    if (child) {
      this.handleChildEvent(child, event);
      return null;
    }

    if (!this.started) {
      this.started =
        event.type === "session.inbox.delivered" &&
        event.data.inboxID === this.options.promptId;
      return null;
    }

    return this.handleRootEvent(event);
  }

  private handleRootEvent(event: OpenCodeEvent): OpenCodeTurnOutcome | null {
    const sessionId = this.options.sessionId;
    switch (event.type) {
      case "session.text.delta":
        if (this.assistantMessageId !== event.data.assistantMessageID) {
          this.flushAssistantMessage();
          this.assistantMessageId = event.data.assistantMessageID;
        }
        this.assistantContent += event.data.delta;
        this.options.onEvent({
          type: "message.delta",
          sessionId,
          messageId: event.data.assistantMessageID,
          role: "assistant",
          kind: "response",
          delta: event.data.delta,
          createdAt: new Date(event.created).toISOString(),
        });
        return null;
      case "session.reasoning.delta":
        this.options.onEvent({
          type: "message.delta",
          sessionId,
          messageId: `${event.data.assistantMessageID}:reasoning:${event.data.ordinal}`,
          role: "assistant",
          kind: "reasoning",
          delta: event.data.delta,
          createdAt: new Date(event.created).toISOString(),
        });
        return null;
      case "session.step.ended":
        if (this.assistantMessageId === event.data.assistantMessageID) {
          this.flushAssistantMessage();
        }
        this.options.onEvent({
          type: "usage.updated",
          sessionId,
          usage: mapUsage(event.data.tokens, event.data.cost),
          receivedAt: new Date(event.created).toISOString(),
        });
        return null;
      case "session.execution.succeeded":
        return this.finish("succeeded");
      case "session.execution.interrupted":
        return this.finish("interrupted");
      case "session.execution.failed":
        this.flushAssistantMessage();
        if (event.data.error.type === "aborted") {
          return this.finish("interrupted");
        }
        this.options.onEvent({
          type: "error",
          sessionId,
          message: formatOpenCodeExecutionError(event.data.error),
        });
        this.options.onEvent({
          type: "state.changed",
          sessionId,
          status: "error",
        });
        return "failed";
      default:
        this.handleToolEvent(sessionId, event, true);
        return null;
    }
  }

  private handleChildEvent(child: ChildState, event: OpenCodeEvent) {
    if (
      event.type === "session.text.ended" ||
      event.type === "session.reasoning.ended"
    ) {
      const text = event.data.text.trim();
      if (!text) return;
      const kind =
        event.type === "session.text.ended" ? "response" : "reasoning";
      this.options.onEvent({
        type: "message.completed",
        sessionId: child.appSessionId,
        message: {
          id: `${child.appSessionId}:${event.data.assistantMessageID}:${kind}:${event.data.ordinal}`,
          sessionId: child.appSessionId,
          role: "assistant",
          kind,
          content: text,
          attachments: [],
          createdAt: new Date(event.created).toISOString(),
        },
      });
      return;
    }

    this.handleToolEvent(child.appSessionId, event, false);
  }

  private handleToolEvent(
    appSessionId: string,
    event: OpenCodeEvent,
    isRoot: boolean,
  ) {
    const now = new Date(
      "created" in event ? event.created : Date.now(),
    ).toISOString();
    switch (event.type) {
      case "session.tool.input.started": {
        const isSubagent = isRoot && event.data.name === SUBAGENT_TOOL;
        const record: AgentToolCallRecord = {
          id: isRoot ? event.data.id : `${appSessionId}:${event.data.id}`,
          sessionId: appSessionId,
          title: isSubagent ? "Using subagent" : event.data.name,
          kind: isSubagent ? "task" : event.data.name.toLowerCase(),
          status: "pending",
          content: [],
          rawInput: null,
          rawOutput: null,
          locations: [],
          startedAt: now,
          updatedAt: now,
        };
        this.tools.set(`${event.data.sessionID}:${event.data.id}`, {
          name: event.data.name,
          record,
        });
        this.emitTool("tool.started", record);
        return;
      }
      case "session.tool.called":
        this.updateTool(event.data.sessionID, event.data.id, now, {
          status: "in_progress",
          rawInput: event.data.input,
        });
        return;
      case "session.tool.progress":
        if (isRoot) {
          this.linkSubagent(event.data.id, event.data.metadata, now);
        }
        return;
      case "session.tool.success":
        if (isRoot) {
          this.linkSubagent(event.data.id, event.data.metadata, now);
        }
        this.updateTool(event.data.sessionID, event.data.id, now, {
          status: "completed",
          rawOutput: toolContentText(event.data.content),
        });
        return;
      case "session.tool.failed":
        this.updateTool(event.data.sessionID, event.data.id, now, {
          status: "failed",
          rawOutput: event.data.error.message,
        });
        return;
    }
  }

  private updateTool(
    openCodeSessionId: string,
    toolId: string,
    updatedAt: string,
    patch: Pick<AgentToolCallRecord, "status"> &
      Partial<Pick<AgentToolCallRecord, "rawInput" | "rawOutput">>,
  ) {
    const key = `${openCodeSessionId}:${toolId}`;
    const state = this.tools.get(key);
    if (!state) return;

    const isSubagent = Boolean(state.record.subagent);
    state.record = {
      ...state.record,
      ...patch,
      rawInput: patch.rawInput ?? state.record.rawInput,
      rawOutput: isSubagent ? null : (patch.rawOutput ?? null),
      updatedAt,
    };
    const finished = patch.status === "completed" || patch.status === "failed";
    this.emitTool(finished ? "tool.finished" : "tool.started", state.record);

    const child = [...this.children.values()].find(
      (candidate) => candidate.toolKey === key,
    );
    if (child) {
      this.emitChildSession(child, state.record);
    }
  }

  private linkSubagent(
    toolId: string,
    metadata: Record<string, unknown> | undefined,
    updatedAt: string,
  ) {
    const key = `${this.options.openCodeSessionId}:${toolId}`;
    const state = this.tools.get(key);
    const childOpenCodeSessionId = getString(metadata ?? null, "sessionID");
    if (!state || state.name !== SUBAGENT_TOOL || !childOpenCodeSessionId) {
      return;
    }

    const child = this.children.get(childOpenCodeSessionId) ?? {
      appSessionId: `opencode-subagent:${this.options.sessionId}:${childOpenCodeSessionId}`,
      title: null,
      toolKey: null,
    };
    if (child.toolKey === key) return;

    child.toolKey = key;
    this.children.set(childOpenCodeSessionId, child);
    const input = getRecord(state.record.rawInput);
    const description = getString(input, "description") ?? "Subagent";
    state.record = {
      ...state.record,
      title: "Using subagent",
      kind: "task",
      subagent: {
        sessionId: child.appSessionId,
        type: getString(input, "agent"),
        description,
      },
      rawInput: {
        ...input,
        childSessionId: child.appSessionId,
        openCodeSessionId: childOpenCodeSessionId,
      },
      rawOutput: null,
      updatedAt,
    };
    this.emitChildSession(child, state.record);
    const prompt = getString(input, "prompt");
    if (prompt) {
      this.options.onEvent({
        type: "message.completed",
        sessionId: child.appSessionId,
        message: {
          id: `${child.appSessionId}:prompt`,
          sessionId: child.appSessionId,
          role: "user",
          content: prompt,
          attachments: [],
          createdAt: updatedAt,
        },
      });
    }
    this.emitTool("tool.started", state.record);
  }

  private emitChildSession(child: ChildState, toolCall: AgentToolCallRecord) {
    const parent = this.options.parentSession;
    const session: SessionRecord = {
      id: child.appSessionId,
      workspaceId: parent.workspaceId,
      title: child.title ?? toolCall.subagent?.description ?? "Subagent",
      agentType: parent.agentType,
      sessionKind: "subagent",
      parentSessionId: parent.id,
      parentToolCallId: toolCall.id,
      status: mapChildStatus(toolCall.status),
      writeMode: parent.writeMode,
      sessionModeId: parent.sessionModeId,
      permissionMode: parent.permissionMode,
      providerSnapshot: parent.providerSnapshot ?? null,
      createdAt: toolCall.startedAt,
      updatedAt: toolCall.updatedAt,
      lastMessageAt: null,
      archivedAt: null,
    };
    this.options.onEvent({
      type: "session.upserted",
      sessionId: session.id,
      session,
    });
  }

  private emitTool(
    type: "tool.finished" | "tool.started",
    toolCall: AgentToolCallRecord,
  ) {
    this.options.onEvent({ type, sessionId: toolCall.sessionId, toolCall });
  }

  private emitPermissionResolved(
    event: Extract<OpenCodeEvent, { type: "permission.replied" }>,
  ) {
    const decision = mapOpenCodeReply(event.data.reply);
    const now = new Date(event.created).toISOString();
    this.options.onEvent({
      type: "permission.resolved",
      sessionId: this.options.sessionId,
      decision,
      request: {
        id: event.data.requestID,
        sessionId: this.options.sessionId,
        providerId: "opencode",
        kind: "opencode",
        title: event.data.requestID,
        description: null,
        rawInput: event.data,
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

  private flushAssistantMessage() {
    if (!this.assistantMessageId || !this.assistantContent) return;

    this.options.onEvent({
      type: "message.completed",
      sessionId: this.options.sessionId,
      message: {
        id: this.assistantMessageId,
        sessionId: this.options.sessionId,
        role: "assistant",
        kind: "response",
        content: this.assistantContent,
        attachments: [],
        createdAt: new Date().toISOString(),
      },
    });
    this.assistantMessageId = "";
    this.assistantContent = "";
  }

  private finish(outcome: OpenCodeTurnOutcome): OpenCodeTurnOutcome {
    this.flushAssistantMessage();
    this.options.onEvent({
      type: "state.changed",
      sessionId: this.options.sessionId,
      status: "idle",
    });
    return outcome;
  }
}

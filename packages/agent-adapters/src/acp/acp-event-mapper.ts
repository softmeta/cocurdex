import crypto from "node:crypto";
import type {
  ContentBlock,
  PromptResponse,
  SessionConfigOption,
  SessionModeState,
  SessionNotification,
  StopReason,
  ToolCall,
  ToolCallContent,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import type {
  AgentEvent,
  AgentSessionConfigOption,
  AgentToolCallContent,
  AgentToolCallRecord,
  AgentUsageRecord,
  MessageRecord,
} from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";
import { createNativeSessionTitleTracker } from "../shared/native-session-title";
import {
  acpDiffMapToEvidence,
  aggregateAcpToolDiffs,
  emitNativeWorkspaceEvidence,
} from "../workspace-changes/native-evidence";

interface MessageBuffer {
  content: string;
  createdAt: string;
  id: string;
  kind: "reasoning" | "response";
}

// Chunks without a provider message id all share this slot: the protocol
// offers nothing else to tell concurrent anonymous streams apart.
const ANONYMOUS_PROVIDER_MESSAGE_ID = "";

function messageSegmentKey(
  kind: MessageBuffer["kind"],
  providerMessageId: string | null,
) {
  // NUL keeps the two parts unambiguous — provider ids are opaque strings.
  return `${kind}\u0000${providerMessageId ?? ANONYMOUS_PROVIDER_MESSAGE_ID}`;
}

function flattenSelectOptions(option: SessionConfigOption) {
  if (option.type !== "select") {
    return undefined;
  }

  return option.options.flatMap((item) =>
    "group" in item ? item.options : [item],
  );
}

function mapConfigOption(
  option: SessionConfigOption,
): AgentSessionConfigOption {
  if (option.type === "boolean") {
    return {
      id: option.id,
      name: option.name,
      description: option.description,
      category: option.category,
      type: "boolean",
      currentValue: option.currentValue,
    };
  }

  return {
    id: option.id,
    name: option.name,
    description: option.description,
    category: option.category,
    type: "select",
    currentValue: option.currentValue,
    options: flattenSelectOptions(option)?.map((item) => ({
      value: item.value,
      name: item.name,
      description: item.description,
    })),
  };
}

export function mapSessionConfigOptions(
  options: SessionConfigOption[],
): AgentSessionConfigOption[] {
  return options.map(mapConfigOption);
}

function mergeToolCall(
  current: AgentToolCallRecord | undefined,
  update: ToolCall | ToolCallUpdate,
  sessionId: string,
  now: string,
): AgentToolCallRecord {
  const content =
    update.content === undefined
      ? (current?.content ?? [])
      : mapToolCallContent(update.content ?? []);

  return {
    id: update.toolCallId,
    sessionId,
    title: update.title ?? current?.title ?? update.toolCallId,
    kind: update.kind ?? current?.kind ?? null,
    status: update.status ?? current?.status ?? "pending",
    content,
    rawInput:
      update.rawInput === undefined ? current?.rawInput : update.rawInput,
    rawOutput:
      update.rawOutput === undefined ? current?.rawOutput : update.rawOutput,
    locations:
      update.locations?.map((location) => ({
        path: location.path,
        line: location.line,
      })) ??
      current?.locations ??
      [],
    startedAt: current?.startedAt ?? now,
    updatedAt: now,
  };
}

function mapToolCallContent(
  content: ToolCallContent[],
): AgentToolCallContent[] {
  return content.map((item) => {
    if (item.type === "diff") {
      return {
        type: "diff",
        path: item.path,
        oldText: item.oldText,
        newText: item.newText,
      };
    }

    if (item.type === "terminal") {
      return {
        type: "terminal",
        terminalId: item.terminalId,
      };
    }

    if (item.content.type === "text") {
      return {
        type: "text",
        text: item.content.text,
      };
    }

    return {
      type: "data",
      value: item.content,
    };
  });
}

function readMetaRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Absolute context-window fill, as reported outside the notification stream. */
export interface AcpContextUsage {
  contextTokensUsed?: number;
  contextWindowSize?: number;
}

function readNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** Grok stamps `_meta.totalTokens` as the current context fill estimate. */
function readTotalTokensFromMeta(meta: Record<string, unknown> | null) {
  return meta ? readNonNegativeInt(meta.totalTokens) : null;
}

function readCostUsd(cost: unknown): number | undefined {
  if (typeof cost !== "object" || cost === null) {
    return undefined;
  }
  const record = cost as Record<string, unknown>;
  const amount = record.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return undefined;
  }
  const currency =
    typeof record.currency === "string" ? record.currency.toUpperCase() : "USD";
  // Only forward USD; other currencies would mislabel the cost meter.
  return currency === "USD" ? amount : undefined;
}

/**
 * Map ACP prompt-response usage (`response.usage` and/or Grok `_meta` keys)
 * into a Cocurdex usage record.
 *
 * - Grok `_meta.inputTokens` / `outputTokens` / cache keys are **per-turn**
 *   (safe to accumulate).
 * - Unstable ACP `response.usage` totals are **session-cumulative** on the
 *   wire, so only `totalTokens` is taken as absolute context fill — not as
 *   additive input/output.
 */
export function mapAcpPromptUsage(
  response: PromptResponse | null | undefined,
): AgentUsageRecord | null {
  if (!response) {
    return null;
  }

  const meta = readMetaRecord(response._meta);
  const usage =
    response.usage && typeof response.usage === "object"
      ? (response.usage as Record<string, unknown>)
      : null;

  const contextTokensUsed =
    readTotalTokensFromMeta(meta) ??
    (usage ? readNonNegativeInt(usage.totalTokens) : null);

  // Prefer Grok's per-turn meta; do not treat ACP `usage.*Tokens` as deltas.
  const inputTokens = readNonNegativeInt(meta?.inputTokens) ?? 0;
  const outputTokens = readNonNegativeInt(meta?.outputTokens) ?? 0;
  const cacheReadInputTokens =
    readNonNegativeInt(meta?.cachedReadTokens) ?? undefined;
  const cacheCreationInputTokens =
    readNonNegativeInt(meta?.cachedWriteTokens) ?? undefined;

  const hasBilling =
    inputTokens > 0 ||
    outputTokens > 0 ||
    (cacheReadInputTokens ?? 0) > 0 ||
    (cacheCreationInputTokens ?? 0) > 0;
  if (contextTokensUsed == null && !hasBilling) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    ...(cacheReadInputTokens != null ? { cacheReadInputTokens } : {}),
    ...(cacheCreationInputTokens != null ? { cacheCreationInputTokens } : {}),
    ...(contextTokensUsed != null ? { contextTokensUsed } : {}),
  };
}

export class AcpEventMapper {
  private readonly activeMessageSegments = new Map<string, string>();
  private lastTimelineTimestampMs = Number.NEGATIVE_INFINITY;
  private lastContextTokensUsed: number | null = null;
  private lastContextWindowSize: number | null = null;
  private lastReportedCostUsd: number | null = null;
  private lastTurnUsage: AgentUsageRecord | null = null;
  private providerSessionId: string | null = null;
  private readonly messages = new Map<string, MessageBuffer>();
  private readonly tools = new Map<string, AgentToolCallRecord>();
  private readonly turnDiffs = new Map<
    string,
    { oldText: string; newText: string }
  >();
  private userMessageId: string | null = null;
  private readonly updateNativeSessionTitle: (title: unknown) => boolean;

  constructor(
    private readonly sessionId: string,
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly now: () => string = () => new Date().toISOString(),
    initialSessionTitle: string | null = null,
    private readonly transformToolCall: (
      toolCall: AgentToolCallRecord,
    ) => AgentToolCallRecord | null = (toolCall) => toolCall,
  ) {
    this.updateNativeSessionTitle = createNativeSessionTitleTracker({
      initialTitle: initialSessionTitle,
      now,
      onEvent,
      sessionId,
    });
  }

  getToolCallTitle(toolCallId: string) {
    return this.tools.get(toolCallId)?.title ?? null;
  }

  beginTurn(userMessageId: string) {
    this.userMessageId = userMessageId;
    this.turnDiffs.clear();
  }

  collectNativeEvidence() {
    if (this.turnDiffs.size === 0) {
      return null;
    }
    return acpDiffMapToEvidence(this.turnDiffs);
  }

  private ingestToolDiffs(toolCall: AgentToolCallRecord) {
    for (const item of toolCall.content ?? []) {
      if (item.type !== "diff") {
        continue;
      }
      aggregateAcpToolDiffs(
        this.turnDiffs,
        item.path,
        item.oldText,
        item.newText,
      );
    }
  }

  initializeSessionState({
    configOptions,
    modes,
    contextWindowSize,
  }: {
    configOptions?: SessionConfigOption[] | null;
    modes?: SessionModeState | null;
    /** Model catalog context window — stamped onto later usage updates. */
    contextWindowSize?: number | null;
  }) {
    if (modes) {
      this.onEvent({
        type: "session.mode.updated",
        sessionId: this.sessionId,
        currentModeId: modes.currentModeId,
        availableModes: modes.availableModes.map((mode) => ({
          id: mode.id,
          name: mode.name,
          description: mode.description,
        })),
      });
    }

    if (configOptions) {
      this.emitConfigOptions(configOptions);
    }

    // Seed the absolute window size so context meters can show `used / limit`
    // even when the global provider-models table has no row for this agent.
    if (
      typeof contextWindowSize === "number" &&
      Number.isFinite(contextWindowSize) &&
      contextWindowSize > 0
    ) {
      this.emitUsage(
        {
          inputTokens: 0,
          outputTokens: 0,
          contextWindowSize: Math.floor(contextWindowSize),
        },
        "session initialization",
      );
    }
  }

  /**
   * Absolute context fill obtained out of band, i.e. not from a session
   * notification. After a resume the agent may recompute its own context
   * estimate without emitting any update, so the only way to observe the new
   * value before the next turn is to ask for it.
   */
  applyContextUsage({ contextTokensUsed, contextWindowSize }: AcpContextUsage) {
    const windowSize = contextWindowSize ?? this.lastContextWindowSize;
    this.emitUsage(
      {
        inputTokens: 0,
        outputTokens: 0,
        ...(contextTokensUsed != null ? { contextTokensUsed } : {}),
        ...(windowSize != null ? { contextWindowSize: windowSize } : {}),
      },
      "session info",
    );
  }

  handle(notification: SessionNotification) {
    this.providerSessionId = notification.sessionId;

    // Grok (and similar agents) stamp context fill on every notification's
    // `_meta.totalTokens` instead of sending a dedicated `usage_update`.
    const meta = readMetaRecord(notification._meta);
    const totalTokens = readTotalTokensFromMeta(meta);
    if (totalTokens != null) {
      logAdapterDiagnostic(
        "info",
        "[DEBUG-grok-context] notification received",
        {
          appSessionId: this.sessionId,
          providerSessionId: notification.sessionId,
          updateType: notification.update.sessionUpdate,
          totalTokens,
          previousContextTokens: this.lastContextTokensUsed,
          isReplay: typeof meta?.isReplay === "boolean" ? meta.isReplay : null,
          eventId:
            typeof meta?.eventId === "string" ||
            typeof meta?.eventId === "number"
              ? meta.eventId
              : null,
          agentTimestampMs:
            typeof meta?.agentTimestampMs === "number"
              ? meta.agentTimestampMs
              : null,
          receivedAt: this.now(),
        },
      );
    }
    this.emitContextFromMeta(meta);

    const { update } = notification;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        this.handleMessageChunk(update.messageId, "response", update.content);
        return;
      case "agent_thought_chunk":
        this.handleMessageChunk(update.messageId, "reasoning", update.content);
        return;
      case "tool_call": {
        this.endMessageSegment();
        const toolCall = this.transformToolCall(
          mergeToolCall(
            undefined,
            update,
            this.sessionId,
            this.nextTimelineTimestamp(),
          ),
        );
        if (!toolCall) {
          return;
        }
        this.tools.set(toolCall.id, toolCall);
        this.onEvent({
          type: "tool.started",
          sessionId: this.sessionId,
          toolCall,
        });
        return;
      }
      case "tool_call_update": {
        this.endMessageSegment();
        const toolCall = this.transformToolCall(
          mergeToolCall(
            this.tools.get(update.toolCallId),
            update,
            this.sessionId,
            this.nextTimelineTimestamp(),
          ),
        );
        if (!toolCall) {
          return;
        }
        this.tools.set(toolCall.id, toolCall);
        this.ingestToolDiffs(toolCall);
        const type =
          toolCall.status === "completed" || toolCall.status === "failed"
            ? "tool.finished"
            : "tool.updated";
        this.onEvent({ type, sessionId: this.sessionId, toolCall });
        if (type === "tool.finished") {
          const evidence = this.collectNativeEvidence();
          if (evidence) {
            emitNativeWorkspaceEvidence(
              this.onEvent,
              this.sessionId,
              this.userMessageId,
              evidence,
            );
          }
        }
        return;
      }
      case "plan":
        this.onEvent({
          type: "plan.updated",
          sessionId: this.sessionId,
          plan: {
            steps: update.entries.map((entry) => ({
              step: entry.content,
              status: entry.status,
            })),
            updatedAt: this.nextTimelineTimestamp(),
          },
        });
        return;
      case "available_commands_update":
        this.onEvent({
          type: "commands.updated",
          sessionId: this.sessionId,
          commands: update.availableCommands.map((command) => ({
            name: command.name,
            description: command.description,
            source: "agent",
          })),
        });
        return;
      case "config_option_update":
        this.emitConfigOptions(update.configOptions);
        return;
      case "current_mode_update":
        this.onEvent({
          type: "session.mode.updated",
          sessionId: this.sessionId,
          currentModeId: update.currentModeId,
        });
        return;
      case "usage_update": {
        // Unstable ACP context-window update (`used` / `size` / optional cost).
        // Cost is cumulative session cost on the wire — convert to a delta so
        // `mergeUsageRecords` can keep summing billable fields.
        const record = update as {
          used?: unknown;
          size?: unknown;
          cost?: unknown;
        };
        const used = readNonNegativeInt(record.used);
        const size = readNonNegativeInt(record.size);
        const cumulativeCostUsd = readCostUsd(record.cost);
        let totalCostUsd: number | undefined;
        if (cumulativeCostUsd != null) {
          totalCostUsd = Math.max(
            0,
            cumulativeCostUsd - (this.lastReportedCostUsd ?? 0),
          );
          this.lastReportedCostUsd = cumulativeCostUsd;
        }
        logAdapterDiagnostic(
          "info",
          "[DEBUG-grok-context] usage_update received",
          {
            appSessionId: this.sessionId,
            providerSessionId: notification.sessionId,
            used,
            size,
            cumulativeCostUsd,
            previousContextTokens: this.lastContextTokensUsed,
            receivedAt: this.now(),
          },
        );
        this.emitUsage(
          {
            inputTokens: 0,
            outputTokens: 0,
            ...(used != null ? { contextTokensUsed: used } : {}),
            ...(size != null ? { contextWindowSize: size } : {}),
            ...(totalCostUsd != null ? { totalCostUsd } : {}),
          },
          "usage_update",
        );
        return;
      }
      case "plan_removed":
      case "plan_update":
        return;
      case "session_info_update":
        this.updateNativeSessionTitle(update.title);
        return;
      case "user_message_chunk":
        return;
    }
  }

  private emitConfigOptions(configOptions: SessionConfigOption[]) {
    this.onEvent({
      type: "session.config.updated",
      sessionId: this.sessionId,
      configOptions: mapSessionConfigOptions(configOptions),
    });
  }

  hasPendingTurn() {
    return this.messages.size > 0 || this.tools.size > 0;
  }

  /**
   * Apply usage from the `session/prompt` response (Grok `_meta` + optional
   * unstable `usage` object) and complete the turn.
   */
  complete(
    stopReason: StopReason,
    durationMs: number,
    promptResponse?: PromptResponse | null,
  ): MessageRecord {
    const promptUsage = mapAcpPromptUsage(promptResponse);
    if (promptUsage) {
      logAdapterDiagnostic(
        "info",
        "[DEBUG-grok-context] prompt response received",
        {
          appSessionId: this.sessionId,
          providerSessionId: this.providerSessionId,
          contextTokensUsed: promptUsage.contextTokensUsed ?? null,
          inputTokens: promptUsage.inputTokens,
          outputTokens: promptUsage.outputTokens,
          cacheReadInputTokens: promptUsage.cacheReadInputTokens ?? null,
          cacheCreationInputTokens:
            promptUsage.cacheCreationInputTokens ?? null,
          previousContextTokens: this.lastContextTokensUsed,
          receivedAt: this.now(),
        },
      );
      this.lastTurnUsage = promptUsage;
      this.emitUsage(promptUsage, "session/prompt response");
    }

    let lastResponse: MessageRecord | undefined;
    for (const message of this.messages.values()) {
      const completed: MessageRecord = {
        id: message.id,
        sessionId: this.sessionId,
        role: "assistant",
        kind: message.kind,
        content: message.content,
        attachments: [],
        createdAt: message.createdAt,
      };
      this.onEvent({
        type: "message.completed",
        sessionId: this.sessionId,
        message: completed,
      });
      if (message.kind === "response") {
        lastResponse = completed;
      }
    }

    const result =
      lastResponse ??
      ({
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        role: "assistant",
        kind: "response",
        content: "",
        attachments: [],
        createdAt: this.nextTimelineTimestamp(),
      } satisfies MessageRecord);
    if (stopReason === "cancelled") {
      for (const toolCall of this.tools.values()) {
        if (toolCall.status === "completed" || toolCall.status === "failed") {
          continue;
        }
        const failedToolCall: AgentToolCallRecord = {
          ...toolCall,
          status: "failed",
          updatedAt: this.nextTimelineTimestamp(),
        };
        this.tools.set(failedToolCall.id, failedToolCall);
        this.onEvent({
          type: "tool.finished",
          sessionId: this.sessionId,
          toolCall: failedToolCall,
        });
      }
    }
    this.onEvent({
      type: "turn.completed",
      sessionId: this.sessionId,
      messageId: result.id,
      durationMs,
      ...(this.lastTurnUsage ? { usage: this.lastTurnUsage } : {}),
      stopReason,
      completedAt: this.nextTimelineTimestamp(),
    });
    this.endMessageSegment();
    this.messages.clear();
    this.tools.clear();
    this.lastTurnUsage = null;
    return result;
  }

  private emitContextFromMeta(meta: Record<string, unknown> | null) {
    const totalTokens = readTotalTokensFromMeta(meta);
    if (totalTokens == null) {
      return;
    }
    this.emitUsage(
      {
        inputTokens: 0,
        outputTokens: 0,
        contextTokensUsed: totalTokens,
        // Keep stamping the seeded window so absolute merges stay complete.
        ...(this.lastContextWindowSize != null
          ? { contextWindowSize: this.lastContextWindowSize }
          : {}),
      },
      "notification._meta.totalTokens",
    );
  }

  private emitUsage(usage: AgentUsageRecord, source: string) {
    const nextUsed = usage.contextTokensUsed ?? null;
    const nextSize = usage.contextWindowSize ?? null;
    const hasBilling =
      usage.inputTokens > 0 ||
      usage.outputTokens > 0 ||
      (usage.cacheReadInputTokens ?? 0) > 0 ||
      (usage.cacheCreationInputTokens ?? 0) > 0 ||
      usage.totalCostUsd != null;
    const contextUnchanged =
      (nextUsed == null || nextUsed === this.lastContextTokensUsed) &&
      (nextSize == null || nextSize === this.lastContextWindowSize);

    if (nextUsed != null || nextSize != null) {
      logAdapterDiagnostic("info", "[DEBUG-grok-context] usage transition", {
        appSessionId: this.sessionId,
        providerSessionId: this.providerSessionId,
        source,
        previousContextTokens: this.lastContextTokensUsed,
        nextContextTokens: nextUsed,
        previousContextWindowSize: this.lastContextWindowSize,
        nextContextWindowSize: nextSize,
        accepted: !contextUnchanged || hasBilling,
        receivedAt: this.now(),
      });
    }

    // Skip pure context-only updates that do not change the window fill.
    if (contextUnchanged && !hasBilling) {
      return;
    }

    if (nextUsed != null) {
      this.lastContextTokensUsed = nextUsed;
    }
    if (nextSize != null) {
      this.lastContextWindowSize = nextSize;
    }

    this.onEvent({
      type: "usage.updated",
      sessionId: this.sessionId,
      usage,
      receivedAt: this.now(),
    });
  }

  private handleMessageChunk(
    messageId: string | null | undefined,
    kind: MessageBuffer["kind"],
    content: ContentBlock,
  ) {
    if (content.type !== "text" || !content.text) {
      return;
    }

    // ACP message IDs identify provider messages, but Cocurdex messages are
    // renderable timeline segments. A tool boundary therefore ends every open
    // segment even when the provider resumes streaming with the same message ID.
    // Within one boundary, segments are tracked per (kind, message ID): agents
    // that explore in parallel interleave chunks from several provider messages,
    // and a single active segment would splice those streams into each other.
    const key = messageSegmentKey(kind, messageId ?? null);
    let id = this.activeMessageSegments.get(key);
    if (!id) {
      id = `${kind}-${crypto.randomUUID()}`;
      this.activeMessageSegments.set(key, id);
    }

    const existing = this.messages.get(id);
    const createdAt = existing?.createdAt ?? this.nextTimelineTimestamp();
    this.messages.set(id, {
      id,
      kind,
      createdAt,
      content: `${existing?.content ?? ""}${content.text}`,
    });
    this.onEvent({
      type: "message.delta",
      sessionId: this.sessionId,
      messageId: id,
      role: "assistant",
      kind,
      delta: content.text,
      createdAt,
    });
  }

  private endMessageSegment() {
    this.activeMessageSegments.clear();
  }

  private nextTimelineTimestamp() {
    // Timeline records from different tables are merged by their timestamps.
    // Preserve ACP notification order even when several updates share a clock
    // millisecond, instead of delegating an unknowable tie to the renderer.
    const currentTimestampMs = Date.parse(this.now());
    if (!Number.isFinite(currentTimestampMs)) {
      throw new Error("ACP event timestamp must be a valid ISO date.");
    }

    const nextTimestampMs = Math.max(
      currentTimestampMs,
      this.lastTimelineTimestampMs + 1,
    );
    this.lastTimelineTimestampMs = nextTimestampMs;
    return new Date(nextTimestampMs).toISOString();
  }
}

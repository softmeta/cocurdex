import { createHash } from "node:crypto";
import {
  type AgentEvent,
  type AgentToolCallRecord,
  type AgentUsageRecord,
  aggregateTurnFileChanges,
  createUnifiedDiff,
  type MessageRecord,
  type TurnFileChange,
} from "@cocurdex/shared";
import {
  AssistantEntry,
  CompactionEntry,
  type EntryRecord,
  type LiveState,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { createContextCompactionTracker } from "../shared/context-compaction-tracker";
import { extractPiEditSnapshot } from "../workspace-changes/native-evidence";

type MessageKind = "response" | "reasoning";

type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: unknown };

type AssistantMessageLike = {
  content?: AssistantBlock[];
  usage?: Record<string, unknown>;
  stopReason?: string;
  errorMessage?: string;
};

type ToolResultLike = {
  toolCallId?: string;
  toolName?: string;
  content?: unknown;
  details?: unknown;
  isError?: boolean;
};

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mapDurableUsage(value: unknown): AgentUsageRecord | null {
  const usage = getRecord(value);
  if (!usage) return null;
  const cost = getRecord(usage.cost);
  return {
    inputTokens: getNumber(usage.input) ?? 0,
    outputTokens: getNumber(usage.output) ?? 0,
    cacheCreationInputTokens: getNumber(usage.cacheWrite) ?? 0,
    cacheReadInputTokens: getNumber(usage.cacheRead) ?? 0,
    contextTokensUsed: getNumber(usage.totalTokens) ?? undefined,
    totalCostUsd: getNumber(cost?.total) ?? undefined,
  };
}

/**
 * A message ID derived from where a block sits in the durable transcript, so the streamed partial
 * and the committed answer share one ID, and a daemon that projects the run again after a restart
 * writes the same rows.
 */
export function durableMessageId(parts: readonly (string | number)[]) {
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, "0") + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}

function blockText(block: AssistantBlock): {
  kind: MessageKind;
  text: string;
} | null {
  if (block.type === "text") return { kind: "response", text: block.text };
  if (block.type === "thinking") {
    return { kind: "reasoning", text: block.thinking };
  }
  return null;
}

/**
 * Projects one session's durable transcript and live state into Cocurdex agent events. Every
 * entry is projected once; message and tool call IDs are stable, so projecting the same entries
 * again, in this process or after a restart, updates rows instead of adding them.
 */
export class DurableProjector {
  private readonly projected = new Set<number>();
  private readonly assistantOrdinals = new Map<number, number>();
  private readonly streamed = new Map<
    string,
    { kind: MessageKind; content: string; createdAt: string }
  >();
  private readonly toolCalls = new Map<string, AgentToolCallRecord>();
  private readonly nativeFiles = new Map<string, TurnFileChange>();
  private readonly nativeSnapshots = new Map<
    string,
    { beforeText: string; afterText: string }
  >();
  private readonly compaction;
  private activeCompactionTask: number | null = null;
  private lastResponse: MessageRecord | null = null;
  private lastFailure: string | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly conversationKey: string,
    private readonly emit: (event: AgentEvent) => void,
    private readonly onFileChanges: (files: TurnFileChange[]) => void,
  ) {
    this.compaction = createContextCompactionTracker({ sessionId, emit });
  }

  /** The newest response the run produced. */
  response() {
    return this.lastResponse;
  }

  /** The error text of the newest assistant answer that failed, if the run's last answer did. */
  failure() {
    return this.lastFailure;
  }

  files() {
    return aggregateTurnFileChanges([...this.nativeFiles.values()]);
  }

  /** Starts a new turn: file changes and the final response are per turn. */
  beginTurn() {
    this.nativeFiles.clear();
    this.nativeSnapshots.clear();
    this.lastResponse = null;
    this.lastFailure = null;
  }

  applyEntries(entries: readonly EntryRecord[]) {
    for (const entry of entries) this.applyEntry(entry);
  }

  applyEntry(entry: EntryRecord) {
    const id = entry.id as number;
    if (this.projected.has(id)) return;
    this.projected.add(id);
    if (AssistantEntry.is(entry)) {
      this.applyAssistant(entry);
    } else if (ToolResultEntry.is(entry)) {
      this.applyToolResult(entry);
    } else if (CompactionEntry.is(entry)) {
      this.finishCompaction({ status: "completed" });
    }
  }

  applyLive(live: LiveState | undefined) {
    if (!live) return;
    this.applyPartial(live);
    for (const slot of live.tools ?? []) {
      if (slot.status !== "running" || slot.entry !== undefined) continue;
      const existing = this.toolCalls.get(slot.callId);
      const output =
        slot.output !== undefined || slot.details !== undefined
          ? {
              content: [{ type: "text", text: slot.output ?? "" }],
              details: slot.details ?? null,
            }
          : null;
      this.emitToolCall({
        ...this.toolCall(slot.callId, slot.name, existing?.rawInput ?? null),
        status: "in_progress",
        rawOutput: output,
      });
    }
    this.applyCompactions(live);
  }

  private applyPartial(live: LiveState) {
    const taskId = live.run?.taskId as number | undefined;
    const message = live.generation?.message as
      | AssistantMessageLike
      | undefined;
    if (taskId === undefined || !message?.content) return;
    const ordinal = this.assistantOrdinals.get(taskId) ?? 0;
    message.content.forEach((block, index) => {
      const text = blockText(block);
      if (!text?.text) return;
      const messageId = durableMessageId([
        this.conversationKey,
        taskId,
        ordinal,
        index,
      ]);
      const previous = this.streamed.get(messageId);
      const createdAt = previous?.createdAt ?? new Date().toISOString();
      const before = previous?.content ?? "";
      if (!text.text.startsWith(before) || text.text === before) return;
      this.streamed.set(messageId, {
        kind: text.kind,
        content: text.text,
        createdAt,
      });
      this.emit({
        type: "message.delta",
        sessionId: this.sessionId,
        messageId,
        role: "assistant",
        kind: text.kind,
        delta: text.text.slice(before.length),
        createdAt: new Date().toISOString(),
      });
    });
  }

  private applyAssistant(entry: EntryRecord) {
    const message = entry.model?.[0] as AssistantMessageLike | undefined;
    if (!message) return;
    const taskId = entry.byTaskId as number | undefined;
    const ordinal =
      taskId === undefined ? 0 : (this.assistantOrdinals.get(taskId) ?? 0);
    if (taskId !== undefined) this.assistantOrdinals.set(taskId, ordinal + 1);
    const owner =
      taskId === undefined ? ["entry", entry.id as number] : [taskId, ordinal];
    (message.content ?? []).forEach((block, index) => {
      if (block.type === "toolCall") {
        this.emitToolCall({
          ...this.toolCall(block.id, block.name, block.arguments ?? null),
          status: "in_progress",
        });
        return;
      }
      const text = blockText(block);
      if (!text?.text.trim()) return;
      const id = durableMessageId([this.conversationKey, ...owner, index]);
      const streamed = this.streamed.get(id);
      this.streamed.delete(id);
      const record: MessageRecord = {
        id,
        sessionId: this.sessionId,
        role: "assistant",
        kind: text.kind,
        content: text.text,
        attachments: [],
        createdAt: streamed?.createdAt ?? new Date().toISOString(),
      };
      this.emit({
        type: "message.completed",
        sessionId: this.sessionId,
        message: record,
      });
      if (text.kind === "response") this.lastResponse = record;
    });
    const stopReason = message.stopReason;
    this.lastFailure =
      stopReason === "error"
        ? (message.errorMessage ?? "Model request failed")
        : null;
    const usage = mapDurableUsage(message.usage);
    if (usage) {
      this.emit({
        type: "usage.updated",
        sessionId: this.sessionId,
        usage,
        receivedAt: new Date().toISOString(),
      });
    }
  }

  private applyToolResult(entry: EntryRecord) {
    const result = entry.model?.[0] as ToolResultLike | undefined;
    if (!result?.toolCallId) return;
    const existing = this.toolCalls.get(result.toolCallId);
    const rawOutput = {
      content: result.content ?? [],
      details: result.details ?? null,
    };
    this.emitToolCall({
      ...this.toolCall(
        result.toolCallId,
        result.toolName ?? existing?.title ?? "Unknown",
        existing?.rawInput ?? null,
      ),
      status: result.isError === true ? "failed" : "completed",
      rawOutput,
    });
    this.recordEdit(rawOutput);
  }

  private recordEdit(rawOutput: { content: unknown; details: unknown }) {
    const snapshot = extractPiEditSnapshot(rawOutput);
    if (!snapshot) return;
    const path = snapshot.file.path;
    const existing = this.nativeFiles.get(path);
    let next = existing
      ? (aggregateTurnFileChanges([existing, snapshot.file])[0] ??
        snapshot.file)
      : snapshot.file;
    if (snapshot.beforeText != null && snapshot.afterText != null) {
      const prior = this.nativeSnapshots.get(path);
      const beforeText = prior?.beforeText ?? snapshot.beforeText;
      this.nativeSnapshots.set(path, {
        beforeText,
        afterText: snapshot.afterText,
      });
      const created = createUnifiedDiff(path, beforeText, snapshot.afterText);
      next = {
        ...next,
        additions: created.additions,
        deletions: created.deletions,
        patch: created.patch,
      };
    }
    this.nativeFiles.set(path, next);
    this.onFileChanges(this.files());
  }

  private applyCompactions(live: LiveState) {
    const current = live.compactions?.[0];
    if (current && this.activeCompactionTask === null) {
      this.activeCompactionTask = current.taskId as number;
      this.compaction.start({
        id: durableMessageId([
          this.conversationKey,
          "compaction",
          current.taskId as number,
        ]),
        trigger: current.trigger === "manual" ? "manual" : "auto",
      });
    }
    const failure = live.compactionFailure;
    if (
      failure &&
      this.activeCompactionTask !== null &&
      (failure.taskId as number) === this.activeCompactionTask
    ) {
      this.finishCompaction({ status: "failed", error: failure.error });
    }
  }

  private finishCompaction(
    result: { status: "completed" } | { status: "failed"; error: string },
  ) {
    if (this.activeCompactionTask === null) return;
    this.activeCompactionTask = null;
    this.compaction.finish(result);
  }

  private toolCall(id: string, title: string, rawInput: unknown) {
    const now = new Date().toISOString();
    const existing = this.toolCalls.get(id);
    return {
      id,
      sessionId: this.sessionId,
      kind: title.toLowerCase(),
      content: [],
      locations: [],
      rawOutput: null,
      startedAt: now,
      ...existing,
      title,
      rawInput,
      status: existing?.status ?? "pending",
      updatedAt: now,
    } satisfies AgentToolCallRecord;
  }

  private emitToolCall(toolCall: AgentToolCallRecord) {
    const previous = this.toolCalls.get(toolCall.id);
    if (
      previous &&
      (previous.status === "completed" || previous.status === "failed") &&
      toolCall.status === "in_progress"
    ) {
      return;
    }
    this.toolCalls.set(toolCall.id, toolCall);
    this.emit({
      type:
        toolCall.status === "completed" || toolCall.status === "failed"
          ? "tool.finished"
          : "tool.started",
      sessionId: this.sessionId,
      toolCall,
    });
  }
}

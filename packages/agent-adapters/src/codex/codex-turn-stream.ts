import type {
  AgentEvent,
  AgentToolCallRecord,
  AgentUsageRecord,
} from "@cocurdex/shared";
import {
  type CodexThreadItem,
  createToolCallRecord,
  isAgentMessageItem,
  isReasoningItem,
  isRecord,
  isToolItem,
} from "./codex-app-server-events";

interface ActiveAssistantMessage {
  id: string;
  content: string;
  createdAt: string;
}

interface ActiveReasoningMessage {
  id: string;
  content: string;
  createdAt: string;
  lastSummaryIndex: number;
}

// Deltas that arrive without an item id share one slot: nothing else can tell
// them apart, so they stay in the single stream the old behaviour assumed.
const ANONYMOUS_ASSISTANT_ITEM_ID = "";

interface CodexTurnStreamOptions {
  sessionId: string;
  onEvent(event: AgentEvent): void;
}

// Per-turn streaming state for one Codex session: the in-flight assistant
// message, reasoning summaries (keyed by reasoning item id), and tool calls
// that receive incremental output deltas.
export function createCodexTurnStream({
  sessionId,
  onEvent,
}: CodexTurnStreamOptions) {
  // Assistant messages usually complete on `turn/item/completed`, well before
  // the turn ends, so the turn summary tracks the last one completed rather
  // than whatever is still streaming at `finishTurn`.
  let lastCompletedAssistantMessageId: string | null = null;
  let lastUsage: AgentUsageRecord | null = null;
  const activeToolCalls = new Map<string, AgentToolCallRecord>();
  // Keyed by item id like the reasoning summaries: a turn can stream more than
  // one assistant message, and a single active slot would splice them together.
  const activeAssistantMessages = new Map<string, ActiveAssistantMessage>();
  const activeReasoningMessages = new Map<string, ActiveReasoningMessage>();

  function reset() {
    lastCompletedAssistantMessageId = null;
    lastUsage = null;
    activeToolCalls.clear();
    activeAssistantMessages.clear();
    activeReasoningMessages.clear();
  }

  function ensureAssistantMessage(itemId: string) {
    let entry = activeAssistantMessages.get(itemId);
    const anonymous =
      itemId && !entry
        ? activeAssistantMessages.get(ANONYMOUS_ASSISTANT_ITEM_ID)
        : undefined;
    if (anonymous) {
      // Deltas streamed before the item id was known belong to this item.
      // Re-key them instead of leaving a duplicate to flush at turn end.
      activeAssistantMessages.delete(ANONYMOUS_ASSISTANT_ITEM_ID);
      activeAssistantMessages.set(itemId, anonymous);
      return anonymous;
    }
    if (!entry) {
      entry = {
        id: itemId || crypto.randomUUID(),
        content: "",
        createdAt: new Date().toISOString(),
      };
      activeAssistantMessages.set(itemId, entry);
    }
    return entry;
  }

  function completeAssistantMessage(
    itemId: string,
    finalContent?: string,
  ): string | null {
    const entry = activeAssistantMessages.get(itemId);
    if (!entry) {
      return null;
    }
    activeAssistantMessages.delete(itemId);

    onEvent({
      type: "message.completed",
      sessionId,
      message: {
        id: entry.id,
        sessionId,
        role: "assistant",
        kind: "response",
        content: finalContent ?? entry.content,
        attachments: [],
        createdAt: entry.createdAt,
      },
    });
    lastCompletedAssistantMessageId = entry.id;
    return entry.id;
  }

  function completeReasoningMessage(itemId: string, fallbackContent: string) {
    const entry = activeReasoningMessages.get(itemId);
    activeReasoningMessages.delete(itemId);
    const content = entry?.content.trim() ? entry.content : fallbackContent;

    if (!content.trim()) {
      return;
    }

    onEvent({
      type: "message.completed",
      sessionId,
      message: {
        id: entry?.id ?? itemId,
        sessionId,
        role: "assistant",
        kind: "reasoning",
        content,
        attachments: [],
        createdAt: entry?.createdAt ?? new Date().toISOString(),
      },
    });
  }

  function handleAgentMessageDelta(params: unknown) {
    if (!isRecord(params) || typeof params.delta !== "string") {
      return;
    }

    const itemId =
      typeof params.itemId === "string"
        ? params.itemId
        : ANONYMOUS_ASSISTANT_ITEM_ID;
    const entry = ensureAssistantMessage(itemId);

    entry.content += params.delta;
    onEvent({
      type: "message.delta",
      sessionId,
      messageId: entry.id,
      role: "assistant",
      kind: "response",
      delta: params.delta,
      createdAt: entry.createdAt,
    });
  }

  // item/reasoning/summaryTextDelta params:
  // { threadId, turnId, itemId, delta, summaryIndex }. A turn may carry
  // multiple summary sections; separate them with a blank line.
  function handleReasoningSummaryDelta(params: unknown) {
    if (
      !isRecord(params) ||
      typeof params.delta !== "string" ||
      typeof params.itemId !== "string"
    ) {
      return;
    }

    const summaryIndex =
      typeof params.summaryIndex === "number" ? params.summaryIndex : 0;
    let entry = activeReasoningMessages.get(params.itemId);

    if (!entry) {
      entry = {
        id: params.itemId,
        content: "",
        createdAt: new Date().toISOString(),
        lastSummaryIndex: summaryIndex,
      };
      activeReasoningMessages.set(params.itemId, entry);
    }

    let delta = params.delta;
    if (summaryIndex > entry.lastSummaryIndex && entry.content) {
      delta = `\n\n${delta}`;
      entry.lastSummaryIndex = summaryIndex;
    }

    entry.content += delta;
    onEvent({
      type: "message.delta",
      sessionId,
      messageId: entry.id,
      role: "assistant",
      kind: "reasoning",
      delta,
      createdAt: new Date().toISOString(),
    });
  }

  // item/commandExecution/outputDelta and item/fileChange/outputDelta both
  // carry { threadId, turnId, itemId, delta }.
  function handleToolOutputDelta(params: unknown) {
    if (
      !isRecord(params) ||
      typeof params.itemId !== "string" ||
      typeof params.delta !== "string"
    ) {
      return;
    }

    const toolCall = activeToolCalls.get(params.itemId);
    if (!toolCall) {
      return;
    }

    const previousOutput =
      typeof toolCall.rawOutput === "string" ? toolCall.rawOutput : "";
    const updated = {
      ...toolCall,
      rawOutput: previousOutput + params.delta,
      updatedAt: new Date().toISOString(),
    };
    activeToolCalls.set(params.itemId, updated);
    onEvent({ type: "tool.started", sessionId, toolCall: updated });
  }

  // `total` is cumulative for the thread, while `last` is the latest response
  // delta and the active context snapshot. Cocurdex accumulates deltas itself,
  // so forwarding `total` would double-count earlier responses.
  function handleTokenUsage(params: unknown) {
    if (!isRecord(params) || !isRecord(params.tokenUsage)) {
      return;
    }

    const last = params.tokenUsage.last;
    if (
      !isRecord(last) ||
      typeof last.inputTokens !== "number" ||
      typeof last.outputTokens !== "number"
    ) {
      return;
    }

    const modelContextWindow = params.tokenUsage.modelContextWindow;
    const usage: AgentUsageRecord = {
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      ...(typeof last.cachedInputTokens === "number"
        ? { cacheReadInputTokens: last.cachedInputTokens }
        : {}),
      ...(typeof last.cacheWriteInputTokens === "number"
        ? { cacheCreationInputTokens: last.cacheWriteInputTokens }
        : {}),
      ...(typeof last.reasoningOutputTokens === "number"
        ? { reasoningOutputTokens: last.reasoningOutputTokens }
        : {}),
      ...(typeof last.totalTokens === "number"
        ? { contextTokensUsed: last.totalTokens }
        : {}),
      ...(typeof modelContextWindow === "number"
        ? { contextWindowSize: modelContextWindow }
        : {}),
    };
    // Kept so the turn summary can report the last usage snapshot alongside
    // the turn duration.
    lastUsage = usage;
    onEvent({
      type: "usage.updated",
      sessionId,
      usage,
      receivedAt: new Date().toISOString(),
    });
  }

  function handleItem(item: CodexThreadItem, isCompleted: boolean) {
    if (isAgentMessageItem(item)) {
      ensureAssistantMessage(item.id);

      if (isCompleted) {
        // The completed item carries the authoritative text, which may differ
        // from the concatenated deltas (trailing edits, dropped chunks).
        completeAssistantMessage(item.id, item.text);
      }
      return;
    }

    if (isReasoningItem(item)) {
      if (isCompleted) {
        completeReasoningMessage(item.id, item.summary.join("\n\n"));
      }
      return;
    }

    if (!isToolItem(item)) {
      return;
    }

    const toolCall = createToolCallRecord(sessionId, item, isCompleted);

    if (toolCall.status === "in_progress") {
      activeToolCalls.set(item.id, toolCall);
      onEvent({ type: "tool.started", sessionId, toolCall });
      return;
    }

    activeToolCalls.delete(item.id);
    onEvent({ type: "tool.finished", sessionId, toolCall });
  }

  // Flushes in-flight messages at turn boundaries so the next turn streams
  // into fresh records.
  // Returns what the caller needs to report the finished turn: the assistant
  // message the stats attach to, plus the last usage snapshot of the turn.
  function finishTurn(): {
    messageId: string | null;
    usage: AgentUsageRecord | null;
  } {
    for (const itemId of [...activeReasoningMessages.keys()]) {
      completeReasoningMessage(itemId, "");
    }

    for (const itemId of [...activeAssistantMessages.keys()]) {
      completeAssistantMessage(itemId);
    }

    return { messageId: lastCompletedAssistantMessageId, usage: lastUsage };
  }

  return {
    reset,
    handleAgentMessageDelta,
    handleReasoningSummaryDelta,
    handleToolOutputDelta,
    handleTokenUsage,
    handleItem,
    finishTurn,
  };
}

import type {
  AgentEvent,
  AgentToolCallRecord,
  AgentUsageRecord,
} from "@cocurdex/shared";
import { createContextCompactionTracker } from "../shared/context-compaction-tracker";
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

const ANONYMOUS_ASSISTANT_ITEM_ID = "";

interface CodexTurnStreamOptions {
  sessionId: string;
  onEvent(event: AgentEvent): void;
  transformToolCall?(toolCall: AgentToolCallRecord): AgentToolCallRecord | null;
}

export function createCodexTurnStream({
  sessionId,
  onEvent,
  transformToolCall = (toolCall) => toolCall,
}: CodexTurnStreamOptions) {
  let lastCompletedAssistantMessageId: string | null = null;
  let lastUsage: AgentUsageRecord | null = null;
  let latestContextTokens: number | null = null;
  let tokensBeforeCompaction: number | null = null;
  const compaction = createContextCompactionTracker({
    sessionId,
    emit: onEvent,
  });
  const activeToolCalls = new Map<string, AgentToolCallRecord>();
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
    lastUsage = usage;
    latestContextTokens = usage.contextTokensUsed ?? latestContextTokens;
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

    if (item.type === "contextCompaction") {
      handleCompactionItem(item.id, isCompleted);
      return;
    }

    if (!isToolItem(item)) {
      return;
    }

    const toolCall = transformToolCall(
      createToolCallRecord(sessionId, item, isCompleted),
    );
    if (!toolCall) {
      return;
    }

    if (toolCall.status === "in_progress") {
      activeToolCalls.set(item.id, toolCall);
      onEvent({ type: "tool.started", sessionId, toolCall });
      return;
    }

    activeToolCalls.delete(item.id);
    onEvent({ type: "tool.finished", sessionId, toolCall });
  }

  function handleCompactionItem(itemId: string, isCompleted: boolean) {
    if (!compaction.isActive()) {
      tokensBeforeCompaction = latestContextTokens;
    }
    if (!isCompleted) {
      compaction.start({ id: itemId });
      return;
    }
    compaction.finish({
      id: itemId,
      status: "completed",
      tokensBefore: tokensBeforeCompaction,
    });
  }

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

    compaction.abandon();
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

import type {
  AgentEvent,
  AgentToolCallRecord,
  AgentUsageUpdatedEvent,
  SessionRecord,
} from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";

// Structural message types for the Claude stream-json protocol. Both the
// Agent SDK (`SDKMessage`) and the headless CLI (`claude -p --output-format
// stream-json`) speak this same protocol, so the adapters share one mapper
// keyed on these shapes instead of SDK-only types.
export interface ClaudeStreamMessage {
  type: string;
}

interface ClaudeToolResultSource {
  parent_tool_use_id?: string | null;
  tool_use_result?: unknown;
  message: { content: unknown };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getPayloadSize(value: unknown) {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === "string") {
    return value.length;
  }

  try {
    return JSON.stringify(value).length;
  } catch (error) {
    logAdapterDiagnostic(
      "debug",
      "[ClaudeMessageMapper] payload size serialize failed",
      {
        error,
      },
    );
    return 0;
  }
}

function normalizeToolResultOutput(output: unknown): unknown {
  if (!Array.isArray(output)) {
    return output;
  }

  const textParts = output.flatMap((item) => {
    const block = asObjectRecord(item);
    if (block?.type !== "text" || typeof block.text !== "string") {
      return [];
    }

    return [block.text];
  });

  return textParts.length === output.length ? textParts.join("\n") : output;
}

export function getToolResultContent(message: ClaudeToolResultSource) {
  const directToolUseId = message.parent_tool_use_id;

  if (directToolUseId && message.tool_use_result !== undefined) {
    return [
      {
        isError: false,
        output: normalizeToolResultOutput(message.tool_use_result),
        toolUseId: directToolUseId,
      },
    ];
  }

  if (!Array.isArray(message.message.content)) {
    return [];
  }

  return message.message.content.flatMap((contentBlock) => {
    const block = asObjectRecord(contentBlock);
    if (
      block?.type !== "tool_result" ||
      typeof block.tool_use_id !== "string"
    ) {
      return [];
    }

    return [
      {
        isError: block.is_error === true,
        output: normalizeToolResultOutput(block.content ?? null),
        toolUseId: block.tool_use_id,
      },
    ];
  });
}

export function extractTextDelta(event: unknown): string | null {
  const record = asObjectRecord(event);
  if (record?.type !== "content_block_delta") {
    return null;
  }

  const delta = asObjectRecord(record.delta);
  if (delta && typeof delta.text === "string") {
    return delta.text;
  }
  return null;
}

export function createToolCallRecord(
  sessionId: string,
  toolUseId: string,
  toolName: string,
  toolInput: unknown,
  status: AgentToolCallRecord["status"],
  output?: string,
): AgentToolCallRecord {
  const now = new Date().toISOString();

  return {
    id: toolUseId,
    sessionId,
    title: toolName,
    kind: toolName.toLowerCase(),
    status,
    content: [],
    rawInput: toolInput,
    rawOutput: output ?? null,
    locations: [],
    startedAt: now,
    updatedAt: now,
  };
}

function getClaudeSubagentType(input: Record<string, unknown> | null) {
  if (typeof input?.subagent_type === "string") {
    return input.subagent_type;
  }
  if (typeof input?.subagentType === "string") {
    return input.subagentType;
  }
  return null;
}

export interface ClaudeMessageMapperOptions {
  sessionId: string;
  logLabel: string;
  onEvent(event: AgentEvent): void;
  parentSession?: SessionRecord;
}

interface ClaudeMessageHandlingOptions {
  resultAttribution?: AgentUsageUpdatedEvent["attribution"];
}

// Stateful per-session mapper from Claude stream-json messages to AgentEvents.
// Holds the in-flight assistant message buffer and the open tool-call table;
// callers reset() it at the start of each turn.
export function createClaudeMessageMapper(options: ClaudeMessageMapperOptions) {
  const { sessionId, logLabel, onEvent, parentSession } = options;
  let activeAssistantMessageId = "";
  let activeAssistantCreatedAt = "";
  let activeAssistantContent = "";
  let activeToolCalls = new Map<string, AgentToolCallRecord>();
  const childMappers = new Map<
    string,
    ReturnType<typeof createClaudeMessageMapper>
  >();
  const childSessions = new Map<string, SessionRecord>();
  let latestAssistantModel = "";

  function flushAssistantMessage() {
    if (!activeAssistantMessageId || !activeAssistantContent) return;

    const messageId = activeAssistantMessageId;
    const createdAt = activeAssistantCreatedAt || new Date().toISOString();
    const content = activeAssistantContent;
    activeAssistantMessageId = "";
    activeAssistantCreatedAt = "";
    activeAssistantContent = "";

    onEvent({
      type: "message.completed",
      sessionId,
      message: {
        id: messageId,
        sessionId,
        role: "assistant",
        content,
        attachments: [],
        createdAt,
      },
    });
  }

  function handleStreamEvent(message: Record<string, unknown>) {
    const delta = extractTextDelta(message.event);
    if (!delta) return;

    if (!activeAssistantMessageId) {
      activeAssistantMessageId = crypto.randomUUID();
      activeAssistantCreatedAt = new Date().toISOString();
    }

    activeAssistantContent += delta;

    onEvent({
      type: "message.delta",
      sessionId,
      messageId: activeAssistantMessageId,
      role: "assistant",
      delta,
      createdAt: activeAssistantCreatedAt,
    });
  }

  function handleAssistantMessage(message: Record<string, unknown>) {
    const assistantMessage = asObjectRecord(message.message);
    const assistantContent = assistantMessage?.content;
    const contentBlocks = Array.isArray(assistantContent)
      ? assistantContent
      : [];
    const model = assistantMessage?.model;
    if (typeof model === "string" && model !== "<synthetic>") {
      latestAssistantModel = model;
    }
    logAdapterDiagnostic("info", `${logLabel} assistant message`, {
      blocks: contentBlocks.map((block) => asObjectRecord(block)?.type),
      sessionId,
    });

    for (const contentBlock of contentBlocks) {
      const block = asObjectRecord(contentBlock);
      if (
        block?.type !== "tool_use" ||
        typeof block.id !== "string" ||
        typeof block.name !== "string"
      ) {
        continue;
      }

      flushAssistantMessage();

      let toolCall = createToolCallRecord(
        sessionId,
        block.id,
        block.name,
        block.input,
        "in_progress",
      );
      const input = asObjectRecord(block.input);
      const isSubagent =
        parentSession && (block.name === "Task" || block.name === "Agent");
      if (isSubagent) {
        const childSessionId = `claude-subagent:${sessionId}:${block.id}`;
        const description =
          (typeof input?.description === "string" &&
            input.description.trim()) ||
          (typeof input?.prompt === "string" && input.prompt.trim()) ||
          "Subagent";
        const type = getClaudeSubagentType(input);
        toolCall = {
          ...toolCall,
          subagent: { sessionId: childSessionId, type, description },
        };
        const childSession: SessionRecord = {
          ...parentSession,
          id: childSessionId,
          title: description,
          sessionKind: "subagent",
          parentSessionId: sessionId,
          parentToolCallId: block.id,
          status: "running",
          createdAt: toolCall.startedAt,
          updatedAt: toolCall.updatedAt,
          lastMessageAt: null,
          archivedAt: null,
        };
        childSessions.set(block.id, childSession);
        childMappers.set(
          block.id,
          createClaudeMessageMapper({
            sessionId: childSessionId,
            logLabel,
            onEvent,
            parentSession: childSession,
          }),
        );
        onEvent({
          type: "session.upserted",
          sessionId: childSessionId,
          session: childSession,
        });
      }

      activeToolCalls.set(toolCall.id, toolCall);
      logAdapterDiagnostic("info", `${logLabel} tool started`, {
        inputBytes: getPayloadSize(block.input),
        sessionId,
        toolName: block.name,
        toolUseId: block.id,
      });

      onEvent({
        type: "tool.started",
        sessionId,
        toolCall,
      });
    }
  }

  function handleUserMessage(message: Record<string, unknown>) {
    const userMessage = asObjectRecord(message.message);
    if (!userMessage) return;

    const toolResults = getToolResultContent({
      parent_tool_use_id:
        typeof message.parent_tool_use_id === "string"
          ? message.parent_tool_use_id
          : null,
      tool_use_result: message.tool_use_result,
      message: { content: userMessage.content },
    });

    for (const toolResult of toolResults) {
      const currentToolCall = activeToolCalls.get(toolResult.toolUseId);
      if (!currentToolCall) {
        logAdapterDiagnostic("info", `${logLabel} unmatched tool result`, {
          outputBytes: getPayloadSize(toolResult.output),
          sessionId,
          toolUseId: toolResult.toolUseId,
        });
        continue;
      }

      const finishedToolCall: AgentToolCallRecord = {
        ...currentToolCall,
        rawOutput: toolResult.output,
        status: toolResult.isError ? "failed" : "completed",
        updatedAt: new Date().toISOString(),
      };

      activeToolCalls.set(finishedToolCall.id, finishedToolCall);
      const childSession = childSessions.get(finishedToolCall.id);
      if (childSession) {
        const updatedSession: SessionRecord = {
          ...childSession,
          status: finishedToolCall.status === "failed" ? "error" : "idle",
          updatedAt: finishedToolCall.updatedAt,
        };
        childSessions.set(finishedToolCall.id, updatedSession);
        onEvent({
          type: "session.upserted",
          sessionId: updatedSession.id,
          session: updatedSession,
        });
      }
      logAdapterDiagnostic("info", `${logLabel} tool finished`, {
        isError: toolResult.isError,
        outputBytes: getPayloadSize(toolResult.output),
        sessionId,
        toolName: finishedToolCall.title,
        toolUseId: finishedToolCall.id,
      });

      onEvent({
        type: "tool.finished",
        sessionId,
        toolCall: finishedToolCall,
      });
    }
  }

  function handleResultMessage(
    message: Record<string, unknown>,
    attribution?: AgentUsageUpdatedEvent["attribution"],
  ) {
    // The terminal `result` message carries cumulative billing usage for this
    // invocation, not an absolute current-context snapshot. Forward the
    // counters without fabricating `contextTokensUsed`.
    const usage = asObjectRecord(message.usage);
    if (usage) {
      const modelUsage = asObjectRecord(message.modelUsage);
      const selectedModelUsage = asObjectRecord(
        modelUsage?.[latestAssistantModel],
      );
      const onlyModelUsage =
        modelUsage && Object.keys(modelUsage).length === 1
          ? asObjectRecord(Object.values(modelUsage)[0])
          : null;
      const contextWindow =
        selectedModelUsage?.contextWindow ?? onlyModelUsage?.contextWindow;
      const contextWindowSize =
        typeof contextWindow === "number" &&
        Number.isFinite(contextWindow) &&
        contextWindow > 0
          ? Math.floor(contextWindow)
          : undefined;
      onEvent({
        type: "usage.updated",
        sessionId,
        ...(attribution ? { attribution } : {}),
        usage: {
          inputTokens:
            typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
          outputTokens:
            typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
          cacheCreationInputTokens:
            typeof usage.cache_creation_input_tokens === "number"
              ? usage.cache_creation_input_tokens
              : 0,
          cacheReadInputTokens:
            typeof usage.cache_read_input_tokens === "number"
              ? usage.cache_read_input_tokens
              : 0,
          ...(contextWindowSize ? { contextWindowSize } : {}),
          totalCostUsd:
            typeof message.total_cost_usd === "number"
              ? message.total_cost_usd
              : undefined,
        },
        receivedAt: new Date().toISOString(),
      });
    }
    if (attribution === "session-only") {
      return;
    }
    flushAssistantMessage();
    onEvent({
      type: "state.changed",
      sessionId,
      status: "idle",
    });
  }

  return {
    reset() {
      activeAssistantMessageId = "";
      activeAssistantCreatedAt = "";
      activeAssistantContent = "";
      activeToolCalls = new Map();
    },
    handleMessage(
      message: ClaudeStreamMessage,
      handlingOptions: ClaudeMessageHandlingOptions = {},
    ) {
      const record = message as unknown as Record<string, unknown>;
      const parentToolUseId =
        typeof record.parent_tool_use_id === "string"
          ? record.parent_tool_use_id
          : null;
      const childMapper = parentToolUseId
        ? childMappers.get(parentToolUseId)
        : null;
      const isParentTaskResult =
        message.type === "user" &&
        parentToolUseId &&
        getToolResultContent({
          parent_tool_use_id: parentToolUseId,
          tool_use_result: record.tool_use_result,
          message: {
            content: asObjectRecord(record.message)?.content,
          },
        }).some((result) => result.toolUseId === parentToolUseId);
      if (childMapper && !isParentTaskResult) {
        childMapper.handleMessage({
          ...record,
          parent_tool_use_id: null,
        } as unknown as ClaudeStreamMessage);
        return;
      }

      switch (message.type) {
        case "stream_event":
          handleStreamEvent(record);
          break;
        case "assistant":
          handleAssistantMessage(record);
          break;
        case "user":
          handleUserMessage(record);
          break;
        case "result":
          handleResultMessage(record, handlingOptions.resultAttribution);
          break;
      }
    },
  };
}

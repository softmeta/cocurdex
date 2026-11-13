import {
  type AgentToolCallRecord,
  type MessageRecord,
  type SessionStatus,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";

export type ActivityKind =
  | "attention"
  | "completed"
  | "planning"
  | "ready"
  | "responding"
  | "thinking"
  | "usingTools";

export type ActivityState = {
  kind: ActivityKind;
  tone: "complete" | "error" | "muted" | "running";
  toolActivityId?: string;
  activeToolCall?: AgentToolCallRecord;
};

function isActiveToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.status === "pending" || toolCall.status === "in_progress";
}

function isWorktreeSetupToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.kind === WORKTREE_SETUP_TOOL_KIND;
}

function startedAfter(toolCall: AgentToolCallRecord, message: MessageRecord) {
  if (toolCall.seq !== undefined && message.seq !== undefined) {
    return toolCall.seq > message.seq;
  }
  return Date.parse(toolCall.startedAt) > Date.parse(message.createdAt);
}

function isStreamingResponse(
  message: MessageRecord,
  toolCalls: AgentToolCallRecord[],
) {
  return (
    message.kind !== "reasoning" &&
    message.content.trim().length > 0 &&
    !toolCalls.some((toolCall) => startedAfter(toolCall, message))
  );
}

export const RESPONSE_STALL_MS = 4000;

export function responseStreamKey(messages: readonly MessageRecord[]) {
  const latest = messages.at(-1);
  if (latest?.role !== "assistant") return null;
  return `${latest.id}:${latest.content.length}`;
}

export function getActivityState({
  isRunning,
  messages,
  responseStalled = false,
  status,
  toolCalls,
}: {
  isRunning: boolean;
  messages: MessageRecord[];
  responseStalled?: boolean;
  status?: SessionStatus;
  toolCalls: AgentToolCallRecord[];
}): ActivityState {
  const latestMessage = messages.at(-1);

  if (status === "error") {
    return { kind: "attention", tone: "error" };
  }

  const latestUserMessage = messages.findLast(
    (message) => message.role === "user",
  );
  const latestToolCall = toolCalls.findLast(
    (toolCall) =>
      !isWorktreeSetupToolCall(toolCall) &&
      (!latestUserMessage || startedAfter(toolCall, latestUserMessage)),
  );
  const runningState = {
    tone: "running" as const,
    toolActivityId: latestToolCall?.id,
  };
  const activeToolCall = toolCalls.findLast(
    (toolCall) =>
      isActiveToolCall(toolCall) && !isWorktreeSetupToolCall(toolCall),
  );
  if (isRunning && activeToolCall) {
    return {
      kind: "usingTools",
      ...runningState,
      activeToolCall,
    };
  }

  if (!isRunning) {
    return latestMessage?.role === "assistant"
      ? { kind: "completed", tone: "complete" }
      : { kind: "ready", tone: "muted" };
  }

  if (
    !responseStalled &&
    latestMessage?.role === "assistant" &&
    isStreamingResponse(latestMessage, toolCalls)
  ) {
    return { kind: "responding", ...runningState };
  }

  return {
    kind: latestMessage?.role === "assistant" ? "thinking" : "planning",
    ...runningState,
  };
}

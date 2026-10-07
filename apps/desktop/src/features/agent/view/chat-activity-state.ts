import {
  type AgentToolCallRecord,
  type MessageRecord,
  type SessionStatus,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";

// `kind` doubles as the i18n key suffix (`agent:activity.<kind>`), so a renamed
// state fails to compile instead of silently falling through to "ready".
export type ActivityKind =
  | "attention"
  | "completed"
  | "planning"
  | "ready"
  | "responding"
  | "thinking"
  | "usingTools";

export type ActivityState = {
  activeToolCalls?: AgentToolCallRecord[];
  kind: ActivityKind;
  tone: "complete" | "error" | "muted" | "running";
};

function isActiveToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.status === "pending" || toolCall.status === "in_progress";
}

export function isWorktreeSetupToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.kind === WORKTREE_SETUP_TOOL_KIND;
}

export function isActivityHeaderBusy(input: {
  hasActiveToolCall: boolean;
  isLastSegment: boolean;
  isLiveConversation: boolean;
}) {
  return (
    input.isLiveConversation && (input.hasActiveToolCall || input.isLastSegment)
  );
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

export function getActivityState({
  isRunning,
  messages,
  status,
  toolCalls,
}: {
  isRunning: boolean;
  messages: MessageRecord[];
  status?: SessionStatus;
  toolCalls: AgentToolCallRecord[];
}): ActivityState {
  const latestMessage = messages.at(-1);

  if (status === "error") {
    return { kind: "attention", tone: "error" };
  }

  const activeToolCalls = toolCalls.filter(
    (toolCall) =>
      isActiveToolCall(toolCall) && !isWorktreeSetupToolCall(toolCall),
  );
  if (isRunning && activeToolCalls.length > 0) {
    return {
      activeToolCalls,
      kind: "usingTools",
      tone: "running",
    };
  }

  if (isRunning && latestMessage?.role === "assistant") {
    return isStreamingResponse(latestMessage, toolCalls)
      ? { kind: "responding", tone: "running" }
      : { kind: "thinking", tone: "running" };
  }

  if (isRunning) {
    return { kind: "planning", tone: "running" };
  }

  if (latestMessage?.role === "assistant") {
    return { kind: "completed", tone: "complete" };
  }

  return { kind: "ready", tone: "muted" };
}

/** `m:ss` for a run duration; minutes keep counting past 60 (`72:05`). */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationMs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

const TOOL_CALL_REVEAL_DELAY_MS = 400;
const TOOL_CALL_MIN_VISIBLE_MS = 800;

export type ShownToolCall = { at: number; toolCall: AgentToolCallRecord };

export function getShownToolCallChangeDelay({
  activeToolCallId,
  now,
  shown,
}: {
  activeToolCallId: string | null;
  now: number;
  shown: ShownToolCall | null;
}): number | null {
  if (activeToolCallId === (shown?.toolCall.id ?? null)) {
    return null;
  }

  const remainingVisibleMs = shown
    ? Math.max(0, shown.at + TOOL_CALL_MIN_VISIBLE_MS - now)
    : 0;

  if (activeToolCallId === null) {
    return remainingVisibleMs;
  }

  return Math.max(TOOL_CALL_REVEAL_DELAY_MS, remainingVisibleMs);
}

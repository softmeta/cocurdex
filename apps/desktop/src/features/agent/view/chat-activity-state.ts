import {
  type AgentToolCallRecord,
  type MessageRecord,
  type SessionStatus,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import { cn } from "@/lib";

// `kind` doubles as the i18n key suffix (`agent:activity.<kind>`), so a renamed
// state fails to compile instead of silently falling through to "ready".
export type ActivityKind =
  | "attention"
  | "completed"
  | "planning"
  | "ready"
  | "thinking"
  | "usingTools";

export type ActivityState = {
  icon: "check" | "error" | "loader" | "wrench";
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
}): ActivityState | null {
  const latestMessage = messages.at(-1);

  if (status === "error") {
    return { icon: "error", kind: "attention", tone: "error" };
  }

  const usesTools = toolCalls.some(
    (toolCall) =>
      isActiveToolCall(toolCall) && !isWorktreeSetupToolCall(toolCall),
  );
  if (isRunning && usesTools) {
    return { icon: "wrench", kind: "usingTools", tone: "running" };
  }

  if (isRunning && latestMessage?.role === "assistant") {
    return isStreamingResponse(latestMessage, toolCalls)
      ? null
      : { icon: "loader", kind: "thinking", tone: "running" };
  }

  if (isRunning) {
    return { icon: "loader", kind: "planning", tone: "running" };
  }

  if (latestMessage?.role === "assistant") {
    return { icon: "check", kind: "completed", tone: "complete" };
  }

  return { icon: "check", kind: "ready", tone: "muted" };
}

// The running tool-call state shows a wrench. A static wrench reads as
// "done", so give it a gentle pulse to signal work is still in progress —
// mirroring the spinner used while thinking/responding.
export function getActivityIconClassName(activity: ActivityState): string {
  return cn("size-3.5", {
    "animate-spin": activity.icon === "loader",
    "animate-pulse": activity.icon === "wrench" && activity.tone === "running",
  });
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

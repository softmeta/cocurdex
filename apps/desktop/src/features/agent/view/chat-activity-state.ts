import type {
  AgentToolCallRecord,
  MessageRecord,
  SessionStatus,
} from "@cocurdex/shared";
import { cn } from "@/lib";

// `kind` doubles as the i18n key suffix (`agent:activity.<kind>`), so a renamed
// state fails to compile instead of silently falling through to "ready".
export type ActivityKind =
  | "attention"
  | "completed"
  | "planning"
  | "ready"
  | "usingTools"
  | "writing";

export type ActivityState = {
  icon: "check" | "error" | "loader" | "wrench";
  kind: ActivityKind;
  tone: "complete" | "error" | "muted" | "running";
};

function hasActiveToolCall(toolCalls: AgentToolCallRecord[]) {
  return toolCalls.some(
    (toolCall) =>
      toolCall.status === "pending" || toolCall.status === "in_progress",
  );
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
    return { icon: "error", kind: "attention", tone: "error" };
  }

  if (isRunning && hasActiveToolCall(toolCalls)) {
    return { icon: "wrench", kind: "usingTools", tone: "running" };
  }

  if (isRunning && latestMessage?.role === "assistant") {
    return { icon: "loader", kind: "writing", tone: "running" };
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

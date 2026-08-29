import type {
  AgentToolCallRecord,
  MessageRecord,
  SessionStatus,
} from "@cocurdex/shared";
import { AlertCircle, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn, useMountEffect } from "@/lib";

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

function ActivityIcon({ activity }: { activity: ActivityState }) {
  const className = getActivityIconClassName(activity);

  if (activity.icon === "error") {
    return <AlertCircle className={className} />;
  }

  if (activity.icon === "wrench") {
    return <Wrench className={className} />;
  }

  if (activity.icon === "loader") {
    return <Loader2 className={className} />;
  }

  return <CheckCircle2 className={className} />;
}

/** `m:ss` for a run duration; minutes keep counting past 60 (`72:05`). */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
}

// ActivityLine only mounts while the run is active (`isRunning &&
// isLatestConversation`), so mount time is the start of the current run.
function useElapsedLabel() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useMountEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  });

  return formatElapsed(now - startedAt);
}

export function ActivityLine({ activity }: { activity: ActivityState }) {
  const { t } = useTranslation("agent");
  const elapsedLabel = useElapsedLabel();

  const isRunning = activity.tone === "running";

  return (
    <div className="flex max-w-fit items-center gap-2 self-start py-1 text-meta font-medium text-chat-fg-muted">
      {/* While running the label's own shimmer signals progress, so the row
          drops the spinner instead of animating two things at once. */}
      {isRunning ? null : <ActivityIcon activity={activity} />}
      <span className={cn(isRunning && "activity-shimmer")}>
        {t(`activity.${activity.kind}`)}
      </span>
      {isRunning ? (
        <span className="tabular-nums text-chat-fg-muted/70">
          {elapsedLabel}
        </span>
      ) : null}
    </div>
  );
}

import type { AgentToolCallRecord } from "@cocurdex/shared";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { useMountEffect } from "@/lib";
import { getToolCallTriggerParts } from "../tool-call/tool-call-utils";
import {
  type ActivityKind,
  type ActivityState,
  formatElapsed,
} from "./chat-activity-state";
import { useSteadyToolCall } from "./use-steady-tool-call";

function ActivityGlyph({
  activity,
  isUsingTool,
}: {
  activity: ActivityState;
  isUsingTool: boolean;
}) {
  if (activity.tone === "running") {
    return (
      <CocurdexMark
        className="-ms-1 size-4 shrink-0"
        motion={isUsingTool ? "working" : "thinking"}
      />
    );
  }

  if (activity.tone === "error") {
    return <AlertCircle className="size-3.5 shrink-0" />;
  }

  return <CheckCircle2 className="size-3.5 shrink-0" />;
}

function ToolCallLabel({
  otherCount,
  toolCall,
}: {
  otherCount: number;
  toolCall: AgentToolCallRecord;
}) {
  const { title, secondary } = getToolCallTriggerParts(toolCall);

  return (
    <>
      <span className="min-w-0 truncate">
        {title}
        {secondary ? (
          <span className="ms-1.5 font-normal text-chat-fg-muted/80">
            {secondary}
          </span>
        ) : null}
      </span>
      {otherCount > 0 ? (
        <span className="shrink-0 tabular-nums">+{otherCount}</span>
      ) : null}
    </>
  );
}

function getIdleActivityKind(activity: ActivityState): ActivityKind {
  return activity.kind === "usingTools" ? "thinking" : activity.kind;
}

function useElapsedLabel(runStartedAt?: number) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(mountedAt);

  useMountEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  });

  return formatElapsed(now - (runStartedAt ?? mountedAt));
}

export function ActivityLine({
  activity,
  runStartedAt,
}: {
  activity: ActivityState;
  runStartedAt?: number;
}) {
  const { t } = useTranslation("agent");
  const elapsedLabel = useElapsedLabel(runStartedAt);
  const activeToolCalls = activity.activeToolCalls ?? [];
  const steadyToolCall = useSteadyToolCall(activeToolCalls.at(-1));
  const otherToolCallCount = activeToolCalls.filter(
    (toolCall) => toolCall.id !== steadyToolCall?.id,
  ).length;

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 self-start py-1 pe-1.5 text-meta font-medium text-chat-fg-muted">
      <ActivityGlyph activity={activity} isUsingTool={!!steadyToolCall} />
      {steadyToolCall ? (
        <ToolCallLabel
          otherCount={otherToolCallCount}
          toolCall={steadyToolCall}
        />
      ) : (
        <span className="shrink-0">
          {t(`activity.${getIdleActivityKind(activity)}`)}
        </span>
      )}
      {activity.tone === "running" ? (
        <span className="shrink-0 tabular-nums text-chat-fg-muted/70">
          {elapsedLabel}
        </span>
      ) : null}
    </div>
  );
}

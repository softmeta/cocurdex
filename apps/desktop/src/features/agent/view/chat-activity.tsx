import type { AgentToolCallRecord } from "@cocurdex/shared";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { useMountEffect } from "@/lib";
import { useToolCallTriggerParts } from "../tool-call/use-tool-call-trigger-parts";
import {
  type ActivityKind,
  type ActivityState,
  type ActivityStep,
  formatElapsed,
} from "./chat-activity-state";
import { useActivityMotion } from "./use-activity-motion";
import { useSteadyStep } from "./use-steady-step";
import { useSteadyToolCall } from "./use-steady-tool-call";

function ActivityGlyph({ activity }: { activity: ActivityState }) {
  const { completeWorkingCycle, motion } = useActivityMotion(activity);
  if (activity.tone === "running") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <CocurdexMark
          className="size-4 shrink-0"
          motion={motion}
          onWorkingCycleComplete={completeWorkingCycle}
        />
      </span>
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
  const { title, secondary } = useToolCallTriggerParts(toolCall);

  return (
    <>
      <span className="min-w-0 max-w-lg truncate">
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

function LatestStepLabel({ step }: { step: ActivityStep }) {
  if (step.kind === "reasoning") {
    return (
      <span className="min-w-0 max-w-lg truncate font-normal text-chat-fg-muted/70">
        {step.headline}
      </span>
    );
  }

  return <ToolStepLabel toolCall={step.toolCall} />;
}

function ToolStepLabel({ toolCall }: { toolCall: AgentToolCallRecord }) {
  const { title, secondary } = useToolCallTriggerParts(toolCall, "past");
  return (
    <span className="min-w-0 max-w-lg truncate font-normal text-chat-fg-muted/70">
      {secondary ? `${title} ${secondary}` : title}
    </span>
  );
}

function IdleActivityLabel({ activity }: { activity: ActivityState }) {
  const { t } = useTranslation("agent");
  const step = useSteadyStep(activity.latestStep);

  return (
    <>
      <span className="shrink-0">
        {t(`activity.${getIdleActivityKind(activity)}`)}
      </span>
      {step ? <LatestStepLabel step={step} /> : null}
    </>
  );
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
  const elapsedLabel = useElapsedLabel(runStartedAt);
  const activeToolCalls = activity.activeToolCalls ?? [];
  const steadyToolCall = useSteadyToolCall(activeToolCalls.at(-1));
  const otherToolCallCount = activeToolCalls.filter(
    (toolCall) => toolCall.id !== steadyToolCall?.id,
  ).length;

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 self-start py-1 pe-1.5 text-meta font-medium text-chat-fg-muted">
      <ActivityGlyph activity={activity} />
      {activity.tone === "running" ? (
        <span className="shrink-0 tabular-nums text-chat-fg-muted/70">
          {elapsedLabel}
        </span>
      ) : null}
      {steadyToolCall ? (
        <ToolCallLabel
          otherCount={otherToolCallCount}
          toolCall={steadyToolCall}
        />
      ) : (
        <IdleActivityLabel activity={activity} />
      )}
    </div>
  );
}

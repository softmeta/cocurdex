import { type ActivityState, formatElapsed } from "@cocurdex/client-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { AgentRoleAvatar } from "@/features/sessions";
import { cn, useMountEffect } from "@/lib";
import { useChatAssistantRole, useChatPresentation } from "../chat-display";
import { useActivityMotion } from "./use-activity-motion";
import type { LiveActivityText } from "./use-live-activity-text";

function ActivityGlyph({ activity }: { activity: ActivityState }) {
  const { completeWorkingCycle, motion } = useActivityMotion(activity);
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

function useElapsedLabel(runStartedAt?: number) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(mountedAt);

  useMountEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  });

  return formatElapsed(now - (runStartedAt ?? mountedAt));
}

const ASSISTANT_THINKING_STAGES = [
  { afterMs: 0, key: "activity.thinking" },
  { afterMs: 15_000, key: "activity.stillThinking" },
  { afterMs: 40_000, key: "activity.slowResponse" },
] as const;

function useAssistantThinkingStage() {
  const [stage, setStage] = useState(0);

  useMountEffect(() => {
    const timers = ASSISTANT_THINKING_STAGES.slice(1).map((item, index) =>
      window.setTimeout(() => setStage(index + 1), item.afterMs),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  });

  return ASSISTANT_THINKING_STAGES[stage] ?? ASSISTANT_THINKING_STAGES[0];
}

function AssistantThinkingLabel() {
  const { t } = useTranslation("agent");
  const { key } = useAssistantThinkingStage();
  return <span className="activity-shimmer truncate">{t(key)}</span>;
}

function AssistantActivityLabel({ text }: { text: LiveActivityText }) {
  const { t } = useTranslation("agent");
  const role = useChatAssistantRole();

  return (
    <span className="flex min-w-0 items-center gap-2 text-chat-fg-muted">
      {role ? (
        <AgentRoleAvatar role={role} showAgent={false} size="sm" />
      ) : null}
      {text.handling ? (
        <span className="activity-shimmer truncate">
          {t("activity.handling")}
        </span>
      ) : (
        <AssistantThinkingLabel />
      )}
    </span>
  );
}

export function ActivityLiveLabel({
  activity,
  runStartedAt,
  text,
}: {
  activity: ActivityState;
  runStartedAt?: number;
  text: LiveActivityText;
}) {
  if (useChatPresentation() === "assistant") {
    return <AssistantActivityLabel text={text} />;
  }
  return (
    <WorkActivityLabel
      activity={activity}
      runStartedAt={runStartedAt}
      text={text}
    />
  );
}

function WorkActivityLabel({
  activity,
  runStartedAt,
  text,
}: {
  activity: ActivityState;
  runStartedAt?: number;
  text: LiveActivityText;
}) {
  const elapsedLabel = useElapsedLabel(runStartedAt);
  return (
    <span className="flex min-w-0 items-center gap-2 text-chat-fg-muted">
      <ActivityGlyph activity={activity} />
      <span className="shrink-0 tabular-nums text-chat-fg-muted/70">
        {elapsedLabel}
      </span>
      {text.title ? (
        <span
          className={cn(
            "activity-shimmer",
            text.secondary ? "shrink-0" : "min-w-0 truncate",
          )}
        >
          {text.title}
        </span>
      ) : null}
      {text.secondary ? (
        <span
          className="activity-shimmer min-w-0 truncate font-mono [font-variant-ligatures:none]"
          title={text.secondary}
        >
          {text.secondary}
        </span>
      ) : null}
    </span>
  );
}

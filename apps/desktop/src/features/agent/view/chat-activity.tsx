import { formatElapsed } from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { AgentRoleAvatar } from "@/features/sessions";
import { useMountEffect } from "@/lib";
import { useChatAssistantRole, useChatPresentation } from "../chat-display";
import type { ActivityState } from "./chat-activity-state";
import { useActivityMotion } from "./use-activity-motion";

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

function AssistantActivityLabel({ activity }: { activity: ActivityState }) {
  const { t } = useTranslation("agent");
  const role = useChatAssistantRole();

  return (
    <span className="flex min-w-0 items-center gap-2 text-chat-fg-muted">
      {role ? (
        <AgentRoleAvatar role={role} showAgent={false} size="sm" />
      ) : null}
      {activity.kind === "usingTools" ? (
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
}: {
  activity: ActivityState;
  runStartedAt?: number;
}) {
  if (useChatPresentation() === "assistant") {
    return <AssistantActivityLabel activity={activity} />;
  }
  return <WorkActivityLabel activity={activity} runStartedAt={runStartedAt} />;
}

function WorkActivityLabel({
  activity,
  runStartedAt,
}: {
  activity: ActivityState;
  runStartedAt?: number;
}) {
  const { t } = useTranslation("agent");
  const elapsedLabel = useElapsedLabel(runStartedAt);

  return (
    <span className="flex min-w-0 items-center gap-2 text-chat-fg-muted">
      <ActivityGlyph activity={activity} />
      <span className="shrink-0 tabular-nums text-chat-fg-muted/70">
        {elapsedLabel}
      </span>
      <span className="activity-shimmer shrink-0">
        {t(`activity.${activity.kind}`)}
      </span>
    </span>
  );
}

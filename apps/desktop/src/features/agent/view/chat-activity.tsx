import { AlertCircle, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn, useMountEffect } from "@/lib";
import {
  type ActivityState,
  formatElapsed,
  getActivityIconClassName,
} from "./chat-activity-state";

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

  const isRunning = activity.tone === "running";

  return (
    <div
      className={cn(
        "flex max-w-fit items-center gap-2 self-start py-1 pe-1.5 text-meta font-medium text-chat-fg-muted",
        !isRunning && "ps-1.5",
      )}
    >
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

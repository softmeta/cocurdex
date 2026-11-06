import {
  type RoutineRunRecord,
  type RoutineRunStatus,
  routineReportNeedsUser,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";

function statusLabel(t: TFunction<"personal">, status: RoutineRunStatus) {
  switch (status) {
    case "running":
      return t("routines.run.running");
    case "succeeded":
      return t("routines.run.succeeded");
    case "failed":
      return t("routines.run.failed");
    case "skipped":
      return t("routines.run.skipped");
  }
}

function runLabel(t: TFunction<"personal">, run: RoutineRunRecord) {
  if (run.status !== "succeeded") return statusLabel(t, run.status);
  switch (run.outcome) {
    case "dropped":
      return t("routines.run.dropped");
    case "needs_you":
      return t("routines.run.needsYou");
    case "blocked":
      return t("routines.run.blocked");
    default:
      return statusLabel(t, run.status);
  }
}

function runDotClass(run: RoutineRunRecord) {
  if (run.status === "succeeded" && routineReportNeedsUser(run.outcome)) {
    return "bg-chat-status-pending-fg";
  }
  if (run.status === "succeeded" && run.outcome === "dropped") {
    return "bg-muted-foreground";
  }
  return statusDotClass(run.status);
}

function runDetail(run: RoutineRunRecord) {
  if (run.error) return run.error;
  return [run.summary, run.question].filter(Boolean).join("\n");
}

function statusDotClass(status: RoutineRunStatus) {
  return {
    running: "sidebar-activity-dot text-chat-status-pending-fg",
    succeeded: "bg-primary",
    failed: "bg-chat-status-failed-fg",
    skipped: "bg-muted-foreground",
  }[status];
}

export function RoutineRuns({ runs }: { runs: RoutineRunRecord[] }) {
  const { t, i18n } = useTranslation("personal");
  const timeFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const title = t("routines.runs");

  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <Text size="meta" tone="muted">
        {title}
      </Text>
      {runs.length === 0 ? (
        <Text size="meta" tone="muted">
          {t("routines.noRuns")}
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((run) => {
            const label = runLabel(t, run);
            const detail = runDetail(run);
            return (
              <li
                className="flex min-w-0 items-start gap-2"
                data-routine-run-id={run.id}
                key={run.id}
              >
                <span className="flex h-5 w-3 shrink-0 items-center justify-center">
                  <span
                    aria-label={label}
                    className={`size-1.5 rounded-full ${runDotClass(run)}`}
                    role="img"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-baseline justify-between gap-3">
                    <Text>{label}</Text>
                    <Text
                      className="shrink-0 tabular-nums"
                      size="meta"
                      tone="muted"
                    >
                      {timeFormat.format(new Date(run.startedAt))}
                    </Text>
                  </span>
                  {detail ? (
                    <Text
                      className="line-clamp-3 whitespace-pre-line"
                      size="meta"
                      tone={run.error ? "destructive" : "muted"}
                    >
                      {detail}
                    </Text>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

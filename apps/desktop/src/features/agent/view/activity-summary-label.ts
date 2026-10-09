import { i18n } from "@/i18n";
import type { ActivityAction } from "../tool-call/tool-call-action";
import type { ActivitySummary } from "./activity-summary";

function formatAction(action: ActivityAction, count: number): string {
  switch (action) {
    case "command":
      return i18n.t("agent:activity.summary.command", { count });
    case "edit":
      return i18n.t("agent:activity.summary.edit", { count });
    case "fetch":
      return i18n.t("agent:activity.summary.fetch", { count });
    case "read":
      return i18n.t("agent:activity.summary.read", { count });
    case "search":
      return i18n.t("agent:activity.summary.search", { count });
    case "skill":
      return i18n.t("agent:activity.summary.skill", { count });
    case "subagent":
      return i18n.t("agent:activity.summary.subagent", { count });
    case "other":
      return i18n.t("agent:activity.summary.other", { count });
  }
}

function joinClauses(clauses: string[]) {
  return clauses
    .map((clause, index) =>
      index === 0
        ? clause
        : `${clause.charAt(0).toLocaleLowerCase()}${clause.slice(1)}`,
    )
    .join(i18n.t("agent:activity.summary.separator"));
}

export function formatActivitySummary(summary: ActivitySummary) {
  if (summary.kind === "reasoning") {
    return i18n.t("agent:activity.summary.reasoning", {
      count: summary.count,
    });
  }
  if (summary.kind === "replies") {
    return i18n.t("agent:activity.replyCount", { count: summary.count });
  }
  const clauses: string[] = summary.actions.map(({ action, count }) =>
    formatAction(action, count),
  );
  if (summary.otherCount > 0) {
    clauses.push(
      i18n.t("agent:activity.summary.others", { count: summary.otherCount }),
    );
  }
  return joinClauses(clauses);
}

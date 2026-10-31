import type { ActivityAction } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { CondensedItem } from "./transcript-activity";

type ActivityItem = Extract<CondensedItem, { kind: "activity" }>;

function actionClause(
  action: ActivityAction,
  count: number,
  t: TFunction<"sessions">,
) {
  switch (action) {
    case "command":
      return t("activity.command", { count });
    case "edit":
      return t("activity.edit", { count });
    case "fetch":
      return t("activity.fetch", { count });
    case "read":
      return t("activity.read", { count });
    case "search":
      return t("activity.search", { count });
    case "skill":
      return t("activity.skill", { count });
    case "subagent":
      return t("activity.subagent", { count });
    case "other":
      return t("activity.other", { count });
  }
}

export function activityLabel(item: ActivityItem, t: TFunction<"sessions">) {
  if (item.running) return t("detail.working");
  const clauses: string[] = item.summary.actions.map(({ action, count }) =>
    actionClause(action, count, t),
  );
  if (item.summary.otherCount > 0) {
    clauses.push(t("activity.others", { count: item.summary.otherCount }));
  }
  if (item.replies > 0) {
    clauses.push(t("activity.replies", { count: item.replies }));
  }
  return clauses
    .map((clause, index) =>
      index === 0
        ? clause
        : `${clause.charAt(0).toLocaleLowerCase()}${clause.slice(1)}`,
    )
    .join(t("activity.separator"));
}

export function useActivityLabel(item: ActivityItem) {
  const { t } = useTranslation("sessions");
  return activityLabel(item, t);
}

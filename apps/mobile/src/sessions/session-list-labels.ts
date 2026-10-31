import type {
  SessionEnvironment,
  SessionGrouping,
  SessionOrderDirection,
  SessionOrdering,
  SessionRootLimit,
  SessionStatusBucket,
  SessionUpdatedBucket,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export function useSessionListLabels() {
  const { t } = useTranslation("sessions");
  const grouping: Record<SessionGrouping, string> = {
    workspace: t("list.grouping.workspace"),
    status: t("list.grouping.status"),
    updated: t("list.grouping.updated"),
    agent: t("list.grouping.agent"),
    none: t("list.grouping.none"),
  };
  const ordering: Record<SessionOrdering, string> = {
    activity: t("list.ordering.activity"),
    created: t("list.ordering.created"),
    title: t("list.ordering.title"),
  };
  const direction: Record<SessionOrderDirection, string> = {
    desc: t("list.direction.desc"),
    asc: t("list.direction.asc"),
  };
  const status: Record<SessionStatusBucket, string> = {
    attention: t("list.status.attention"),
    error: t("list.status.error"),
    running: t("list.status.running"),
    unread: t("list.status.unread"),
    idle: t("list.status.idle"),
  };
  const updated: Record<SessionUpdatedBucket, string> = {
    today: t("list.updated.today"),
    yesterday: t("list.updated.yesterday"),
    week: t("list.updated.week"),
    older: t("list.updated.older"),
  };
  const environment: Record<SessionEnvironment, string> = {
    local: t("list.environment.local"),
    worktree: t("list.environment.worktree"),
  };
  const rootLimit = (limit: SessionRootLimit) =>
    limit === "all"
      ? t("list.rootLimit.all")
      : t("list.rootLimit.count", { count: Number(limit) });
  return {
    grouping,
    ordering,
    direction,
    status,
    updated,
    environment,
    rootLimit,
  };
}

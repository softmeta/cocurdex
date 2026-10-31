import { useTranslation } from "react-i18next";
import type {
  SessionEnvironment,
  SessionGrouping,
  SessionOrderDirection,
  SessionOrdering,
  SessionProperty,
  SessionRootLimit,
  SessionSource,
  SessionStatusBucket,
  SessionUpdatedBucket,
} from "@/features/sessions/session-list-view";

export function useSessionListViewLabels() {
  const { t } = useTranslation("sessions");

  const grouping: Record<SessionGrouping, string> = {
    workspace: t("sidebar.view.grouping.workspace"),
    status: t("sidebar.view.grouping.status"),
    updated: t("sidebar.view.grouping.updated"),
    agent: t("sidebar.view.grouping.agent"),
    none: t("sidebar.view.grouping.none"),
  };
  const ordering: Record<SessionOrdering, string> = {
    activity: t("sidebar.view.ordering.activity"),
    created: t("sidebar.view.ordering.created"),
    title: t("sidebar.view.ordering.title"),
  };
  const direction: Record<SessionOrderDirection, string> = {
    desc: t("sidebar.view.direction.desc"),
    asc: t("sidebar.view.direction.asc"),
  };
  const rootLimit: Record<SessionRootLimit, string> = {
    "8": t("sidebar.view.rootLimit.count", { count: 8 }),
    "20": t("sidebar.view.rootLimit.count", { count: 20 }),
    all: t("sidebar.view.rootLimit.all"),
  };
  const status: Record<SessionStatusBucket, string> = {
    attention: t("sidebar.view.status.attention"),
    error: t("sidebar.view.status.error"),
    running: t("sidebar.view.status.running"),
    unread: t("sidebar.view.status.unread"),
    idle: t("sidebar.view.status.idle"),
  };
  const updated: Record<SessionUpdatedBucket, string> = {
    today: t("sidebar.view.updated.today"),
    yesterday: t("sidebar.view.updated.yesterday"),
    week: t("sidebar.view.updated.week"),
    older: t("sidebar.view.updated.older"),
  };
  const environment: Record<SessionEnvironment, string> = {
    local: t("sidebar.view.environment.local"),
    worktree: t("sidebar.view.environment.worktree"),
  };
  const source: Record<SessionSource, string> = {
    created: t("sidebar.view.source.created"),
    imported: t("sidebar.view.source.imported"),
    issue: t("sidebar.view.source.issue"),
  };
  const property: Record<SessionProperty, string> = {
    timestamp: t("sidebar.view.property.timestamp"),
    agent: t("sidebar.view.property.agent"),
    model: t("sidebar.view.property.model"),
    role: t("sidebar.view.property.role"),
    workspace: t("sidebar.view.property.workspace"),
    worktree: t("sidebar.view.property.worktree"),
  };

  return {
    direction,
    environment,
    grouping,
    ordering,
    property,
    rootLimit,
    source,
    status,
    updated,
  };
}

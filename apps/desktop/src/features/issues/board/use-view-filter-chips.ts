import type {
  IssueFieldOption,
  IssueLabel,
  ViewFilter,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import {
  type DateFilterField,
  dateSelection,
  FILTER_ALL,
  FILTER_NO_WORKSPACE,
  hidesClosedIssues,
  labelSelection,
  parentSelection,
  statusCategoryScope,
  statusSelection,
  withDateSelection,
  withLabelSelection,
  withoutStatusCategoryFilters,
  withParentSelection,
  withStatusSelection,
  withWorkspaceSelection,
  workspaceSelection,
} from "./view-filters";

export interface ViewFilterChip {
  key: string;
  field: string;
  value: string;
  remove: (filters: ViewFilter[]) => ViewFilter[];
}

const OPEN_CATEGORY_COUNT = 3;
const DATE_FIELDS: readonly DateFilterField[] = ["createdAt", "updatedAt"];

export function useViewFilterChips(
  filters: ViewFilter[],
  workspaces: readonly WorkspaceRecord[],
  labels: readonly IssueLabel[],
  statuses: readonly IssueFieldOption[],
): ViewFilterChip[] {
  const { t } = useTranslation("issues");
  const chips: ViewFilterChip[] = [];

  const scope = statusCategoryScope(filters);
  if (scope) {
    const onlyHidesClosed =
      hidesClosedIssues(filters) && scope.length === OPEN_CATEGORY_COUNT;
    chips.push({
      key: "statusCategory",
      field: t("category.title"),
      value: onlyHidesClosed
        ? t("filter.hideClosed")
        : scope.map((category) => t(`category.${category}`)).join(", "),
      remove: withoutStatusCategoryFilters,
    });
  }

  const status = statusSelection(filters);
  if (status !== FILTER_ALL) {
    chips.push({
      key: "status",
      field: t("filter.status"),
      value: statuses.find((entry) => entry.id === status)?.title ?? status,
      remove: (current) => withStatusSelection(current, FILTER_ALL),
    });
  }

  const workspace = workspaceSelection(filters);
  if (workspace !== FILTER_ALL) {
    chips.push({
      key: "workspace",
      field: t("filter.workspace"),
      value:
        workspace === FILTER_NO_WORKSPACE
          ? t("filter.noWorkspace")
          : (workspaces.find((entry) => entry.id === workspace)?.name ??
            t("dialog.unknownWorkspace")),
      remove: (current) => withWorkspaceSelection(current, FILTER_ALL),
    });
  }

  const label = labelSelection(filters);
  if (label !== FILTER_ALL) {
    chips.push({
      key: "label",
      field: t("filter.label"),
      value: labels.find((entry) => entry.id === label)?.name ?? label,
      remove: (current) => withLabelSelection(current, FILTER_ALL),
    });
  }

  if (parentSelection(filters) !== FILTER_ALL) {
    chips.push({
      key: "parent",
      field: t("filter.parent"),
      value: t("filter.topLevel"),
      remove: (current) => withParentSelection(current, FILTER_ALL),
    });
  }

  for (const field of DATE_FIELDS) {
    const days = dateSelection(filters, field);
    if (days === FILTER_ALL) {
      continue;
    }
    chips.push({
      key: field,
      field: t(field === "createdAt" ? "filter.created" : "filter.updated"),
      value: t("filter.withinDays", { count: Number(days) }),
      remove: (current) => withDateSelection(current, field, FILTER_ALL),
    });
  }

  return chips;
}

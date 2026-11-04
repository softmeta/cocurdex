import type { IssueLabel, ViewFilter, WorkspaceRecord } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import {
  FILTER_ALL,
  FILTER_NO_WORKSPACE,
  hidesClosedIssues,
  labelSelection,
  statusCategoryScope,
  withLabelSelection,
  withoutStatusCategoryFilters,
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

export function useViewFilterChips(
  filters: ViewFilter[],
  workspaces: readonly WorkspaceRecord[],
  labels: readonly IssueLabel[],
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

  return chips;
}

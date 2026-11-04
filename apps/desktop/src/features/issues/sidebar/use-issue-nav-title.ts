import type { ViewSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import type { IssueNavSelection } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

export function useIssueNavTitle(
  selection: IssueNavSelection,
  views: readonly ViewSummary[],
): string | null {
  const { t } = useTranslation("issues");
  if (selection.kind !== "view") {
    return null;
  }
  const view = views.find((candidate) => candidate.id === selection.viewId);
  return view?.title || t("sidebar.untitledBoard");
}

export function useIssueNavScopeLabel(
  selection: IssueNavSelection,
): string | null {
  const presets = usePresetItems();
  if (selection.kind !== "issues" || selection.preset === "all") {
    return null;
  }
  return (
    presets.find((item) => item.preset === selection.preset)?.label ?? null
  );
}

import type { ViewSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import type { IssueNavSelection } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

export function useIssueNavTitle(
  selection: IssueNavSelection,
  views: readonly ViewSummary[],
): string {
  const { t } = useTranslation("issues");
  const presets = usePresetItems();
  if (selection.kind === "agent") {
    return t("sidebar.nav.agent");
  }
  if (selection.kind === "view") {
    const view = views.find((candidate) => candidate.id === selection.viewId);
    return view?.title || t("sidebar.untitledBoard");
  }
  return presets.find((item) => item.preset === selection.preset)?.label ?? "";
}

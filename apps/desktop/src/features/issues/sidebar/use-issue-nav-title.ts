import type { ViewSummary, WorkspaceRecord } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import type { IssueNavSelection } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

export function useIssueNavTitle(
  selection: IssueNavSelection,
  views: readonly ViewSummary[],
  workspaces: readonly WorkspaceRecord[],
): string {
  const { t } = useTranslation("issues");
  if (selection.kind === "view") {
    const view = views.find((candidate) => candidate.id === selection.viewId);
    return view?.title || t("sidebar.untitledBoard");
  }
  const { place } = selection;
  if (place.kind === "workspace") {
    const workspace = workspaces.find((item) => item.id === place.workspaceId);
    return workspace?.name ?? t("sidebar.nav.all");
  }
  if (place.kind === "agent") {
    return place.activity === "working"
      ? t("sidebar.agent.working")
      : t("sidebar.agent.needsYou");
  }
  return t("sidebar.nav.all");
}

export function useIssueNavScopeLabel(
  selection: IssueNavSelection,
  title: string,
): string | null {
  const presets = usePresetItems();
  if (selection.kind !== "issues") {
    return null;
  }
  const preset =
    selection.preset === "all"
      ? null
      : (presets.find((item) => item.preset === selection.preset)?.label ??
        null);
  const place = selection.place.kind === "all" ? null : title;
  const parts = [place, preset].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

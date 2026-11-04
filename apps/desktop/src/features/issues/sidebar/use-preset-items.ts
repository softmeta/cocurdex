import { useTranslation } from "react-i18next";
import type { IssueNavPreset } from "./issue-nav";

export interface IssueNavPresetItem {
  preset: IssueNavPreset;
  label: string;
}

export function usePresetItems(): IssueNavPresetItem[] {
  const { t } = useTranslation("issues");
  return [
    { preset: "all", label: t("sidebar.nav.all") },
    { preset: "active", label: t("sidebar.nav.active") },
    { preset: "backlog", label: t("sidebar.nav.backlog") },
  ];
}

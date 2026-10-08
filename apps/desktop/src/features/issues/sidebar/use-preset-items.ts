import {
  CircleDashed,
  CircleDot,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IssueNavPreset } from "./issue-nav";

export interface IssueNavPresetItem {
  preset: IssueNavPreset;
  icon: LucideIcon;
  label: string;
}

export function usePresetItems(): IssueNavPresetItem[] {
  const { t } = useTranslation("issues");
  return [
    { preset: "all", icon: ListTodo, label: t("sidebar.nav.all") },
    { preset: "active", icon: CircleDot, label: t("sidebar.nav.active") },
    { preset: "backlog", icon: CircleDashed, label: t("sidebar.nav.backlog") },
  ];
}

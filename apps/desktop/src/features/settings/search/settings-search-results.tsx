import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import {
  SidebarListRow,
  SidebarListRowLabel,
  SidebarMenu,
  SidebarMenuItem,
  Text,
} from "@/components/ui";
import type { SettingsSectionItem } from "../settings-sections";
import type { SettingsSearchSectionResult } from "./settings-search";
import type { SettingsSearchTarget } from "./settings-search-targets";

interface SettingsSearchResultsProps {
  activeTarget: SettingsSearchTarget | null;
  id: string;
  results: SettingsSearchSectionResult[];
  sectionsById: ReadonlyMap<SettingsSectionId, SettingsSectionItem>;
  onSelect(target: SettingsSearchTarget): void;
}

function isSameTarget(
  a: SettingsSearchTarget | null,
  b: SettingsSearchTarget,
): boolean {
  return a?.section === b.section && a.settingId === b.settingId;
}

export function SettingsSearchResults({
  activeTarget,
  id,
  results,
  sectionsById,
  onSelect,
}: SettingsSearchResultsProps) {
  const { t } = useTranslation("settings");

  if (results.length === 0) {
    return (
      <div className="px-2 py-3">
        <Text size="body" tone="muted">
          {t("sidebar.searchEmpty")}
        </Text>
      </div>
    );
  }

  return (
    <SidebarMenu aria-label={t("sidebar.searchResults")} id={id}>
      {results.map((result) => {
        const section = sectionsById.get(result.section);
        if (!section) return null;
        const Icon = section.icon;
        const sectionTarget = { section: result.section, settingId: null };
        return (
          <SidebarMenuItem key={result.section}>
            <SidebarListRow
              data-settings-search-result={result.section}
              isActive={isSameTarget(activeTarget, sectionTarget)}
              onClick={() => onSelect(sectionTarget)}
              render={<button type="button" />}
            >
              <Icon className="size-3.5 shrink-0" />
              <SidebarListRowLabel>
                {t(`sections.${section.labelKey}`)}
              </SidebarListRowLabel>
            </SidebarListRow>
            {result.settings.map((setting) => {
              const target = {
                section: result.section,
                settingId: setting.id,
                fallbackId: setting.fallbackId,
              };
              return (
                <SidebarListRow
                  data-settings-search-result={setting.id}
                  isActive={isSameTarget(activeTarget, target)}
                  key={setting.id}
                  onClick={() => onSelect(target)}
                  render={<button type="button" />}
                  variant="muted"
                >
                  <span aria-hidden className="size-3.5 shrink-0" />
                  <SidebarListRowLabel>{setting.title}</SidebarListRowLabel>
                </SidebarListRow>
              );
            })}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout";
import {
  ScrollArea,
  SidebarListRow,
  SidebarListRowLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui";
import type { SettingsSectionItem } from "./settings-sections";

function SettingsSidebarSection({
  activeSection,
  items,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  items: SettingsSectionItem[];
  onSectionChange(sectionId: SettingsSectionId): void;
}) {
  const { t } = useTranslation("settings");

  return (
    <SidebarMenu>
      {items.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === activeSection;

        return (
          <SidebarMenuItem key={section.id}>
            <SidebarListRow
              isActive={isActive}
              onClick={() => onSectionChange(section.id)}
              render={<button type="button" />}
            >
              <Icon className="size-3.5 shrink-0" />
              <SidebarListRowLabel>
                {t(`sections.${section.labelKey}`)}
              </SidebarListRowLabel>
            </SidebarListRow>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  coreSections: SettingsSectionItem[];
  sidebarWidth?: number;
  onSectionChange(sectionId: SettingsSectionId): void;
}

export function SettingsSidebar({
  activeSection,
  coreSections,
  sidebarWidth,
  onSectionChange,
}: SettingsSidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-sidebar text-sidebar-fg"
      style={{ width: sidebarWidth ?? 240 }}
    >
      {/* Draggable titlebar spacer; the back/forward controls live in the
          titlebar overlay rendered by SettingsScreen. */}
      <div className="app-drag h-9 shrink-0" />

      <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
        <SettingsSidebarSection
          activeSection={activeSection}
          items={coreSections}
          onSectionChange={onSectionChange}
        />
      </ScrollArea>
    </aside>
  );
}

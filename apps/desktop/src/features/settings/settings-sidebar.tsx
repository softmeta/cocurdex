import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout";
import {
  ScrollArea,
  SidebarListRow,
  SidebarListRowLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui";
import {
  collapsedSettingsClusterIdsAtom,
  toggleSettingsClusterCollapsedAtom,
} from "./settings-cluster-store";
import type {
  SettingsClusterGroup,
  SettingsSectionItem,
} from "./settings-sections";

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
  clusters: SettingsClusterGroup[];
  sidebarWidth?: number;
  onSectionChange(sectionId: SettingsSectionId): void;
}

export function SettingsSidebar({
  activeSection,
  clusters,
  sidebarWidth,
  onSectionChange,
}: SettingsSidebarProps) {
  const { t } = useTranslation("settings");
  const collapsedClusterIds = useAtomValue(collapsedSettingsClusterIdsAtom);
  const toggleClusterCollapsed = useSetAtom(toggleSettingsClusterCollapsedAtom);

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-sidebar text-sidebar-fg"
      style={{ width: sidebarWidth ?? 240 }}
    >
      {/* Draggable titlebar spacer; the back/forward controls live in the
          titlebar overlay rendered by SettingsScreen. */}
      <div className="app-drag h-9 shrink-0" />

      <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
        {clusters.map((cluster, index) => {
          const isCollapsed = collapsedClusterIds.includes(cluster.id);
          return (
            <div className={index > 0 ? "mt-5" : undefined} key={cluster.id}>
              <button
                aria-expanded={!isCollapsed}
                className="group flex w-full cursor-default items-center gap-1.5 rounded-control px-2 py-1 font-medium text-meta text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                type="button"
                onClick={() => toggleClusterCollapsed(cluster.id)}
              >
                <span className="min-w-0 flex-1 truncate text-start">
                  {t(`groups.${cluster.id}`)}
                </span>
                {isCollapsed ? (
                  <ChevronRight className="size-3 shrink-0 rtl:-scale-x-100" />
                ) : (
                  <ChevronDown className="size-3 shrink-0" />
                )}
              </button>
              {isCollapsed ? null : (
                <SettingsSidebarSection
                  activeSection={activeSection}
                  items={cluster.items}
                  onSectionChange={onSectionChange}
                />
              )}
            </div>
          );
        })}
      </ScrollArea>
    </aside>
  );
}

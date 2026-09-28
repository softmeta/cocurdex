import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout";
import {
  ScrollArea,
  SidebarListRow,
  SidebarListRowLabel,
  SidebarMenu,
  SidebarMenuItem,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
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
            <div
              className={cn("flex flex-col", index > 0 && "mt-3")}
              key={cluster.id}
            >
              <button
                aria-expanded={!isCollapsed}
                className="flex h-7 w-full cursor-default items-center gap-1 rounded-control px-2 text-muted-foreground/70 transition-colors hover:text-foreground"
                type="button"
                onClick={() => toggleClusterCollapsed(cluster.id)}
              >
                <Text size="meta" truncate weight="medium">
                  {t(`groups.${cluster.id}`)}
                </Text>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isCollapsed && "-rotate-90 rtl:rotate-90",
                  )}
                />
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

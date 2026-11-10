import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import { AppSearchInput } from "@/components/app";
import {
  ScrollArea,
  SidebarListRow,
  SidebarListRowLabel,
  SidebarMenu,
  SidebarMenuItem,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { searchSettings } from "./search/settings-search";
import { buildSettingsSearchCorpus } from "./search/settings-search-docs";
import { SettingsSearchResults } from "./search/settings-search-results";
import { revealSettingsSearchTarget } from "./search/settings-search-reveal";
import {
  flattenSettingsSearchResults,
  type SettingsSearchTarget,
  stepSettingsSearchTarget,
} from "./search/settings-search-targets";
import { useSettingsSearchShortcut } from "./search/use-settings-search-shortcut";
import {
  collapsedSettingsClusterIdsAtom,
  toggleSettingsClusterCollapsedAtom,
} from "./settings-cluster-store";
import {
  isConnectionSection,
  type SettingsClusterGroup,
  type SettingsSectionItem,
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
        const isActive =
          section.id === activeSection ||
          (section.id === "apps" && isConnectionSection(activeSection));

        return (
          <SidebarMenuItem key={section.id}>
            <SidebarListRow
              data-settings-section={section.id}
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
  onBackToApp(): void;
  onSectionChange(sectionId: SettingsSectionId): void;
}

export function SettingsSidebar({
  activeSection,
  clusters,
  sidebarWidth,
  onBackToApp,
  onSectionChange,
}: SettingsSidebarProps) {
  const { t, i18n } = useTranslation("settings");
  const collapsedClusterIds = useAtomValue(collapsedSettingsClusterIdsAtom);
  const toggleClusterCollapsed = useSetAtom(toggleSettingsClusterCollapsedAtom);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  useSettingsSearchShortcut(searchInputRef);

  const sections = clusters.flatMap((cluster) => cluster.items);
  const sectionsById = new Map(sections.map((item) => [item.id, item]));
  const isSearching = query.trim().length > 0;
  const corpus = isSearching
    ? buildSettingsSearchCorpus(i18n.language, sections)
    : null;
  const results = corpus
    ? searchSettings(query, corpus.sections, corpus.docs)
    : [];
  const targets = flattenSettingsSearchResults(results);
  const activeTarget = targets[cursor] ?? null;

  const openTarget = (target: SettingsSearchTarget) => {
    onSectionChange(target.section);
    if (target.settingId) {
      revealSettingsSearchTarget(target.settingId, target.fallbackId);
    }
  };

  const handleSelect = (target: SettingsSearchTarget) => {
    setCursor(
      targets.findIndex(
        (item) =>
          item.section === target.section &&
          item.settingId === target.settingId,
      ),
    );
    openTarget(target);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      return;
    }
    if (!isSearching) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(
        stepSettingsSearchTarget(
          targets,
          cursor,
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
      return;
    }
    if (event.key === "Enter" && activeTarget) {
      event.preventDefault();
      openTarget(activeTarget);
    }
  };

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-sidebar text-sidebar-fg"
      style={{ width: sidebarWidth ?? 240 }}
    >
      <div className="app-drag h-9 shrink-0" />

      <div className="shrink-0 px-3 pb-2">
        <SidebarListRow render={<button type="button" />} onClick={onBackToApp}>
          <ChevronLeft className="size-3.5 shrink-0 rtl:-scale-x-100" />
          <SidebarListRowLabel>{t("sidebar.backToApp")}</SidebarListRowLabel>
        </SidebarListRow>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <AppSearchInput
          aria-controls={isSearching ? resultsId : undefined}
          aria-label={t("sidebar.search")}
          placeholder={t("sidebar.search")}
          ref={searchInputRef}
          role="searchbox"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
        {isSearching ? (
          <SettingsSearchResults
            activeTarget={activeTarget}
            id={resultsId}
            results={results}
            sectionsById={sectionsById}
            onSelect={handleSelect}
          />
        ) : null}
        {isSearching
          ? null
          : clusters.map((cluster, index) => {
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

import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout";
import {
  type ChatLayoutMode,
  ResizableSidebarSlot,
  ScreenNavButtons,
  SidebarToggleButton,
} from "@/app/layout";
import {
  TITLEBAR_HEIGHT,
  TITLEBAR_TRAFFIC_LIGHT_RESERVE,
} from "@/app/layout/app-shell/app-shell-layout";
import { ScrollArea } from "@/components/ui";
import { AppUpdateSettingsPanel } from "@/features/app-update";
import { AgentRoleSettingsPanel } from "@/features/sessions/agent-role";
import { ShortcutsSettingsPanel } from "@/features/shortcuts";
import type { LanguageMode } from "@/i18n/language";
import { cn } from "@/lib";
import { AdapterSettingsPanel } from "./adapters";
import { AppearancePanel } from "./appearance-settings";
import { ArchivedSessionsPanel } from "./archived-sessions";
import { EditorSettingsPanel } from "./editor-settings";
import { GeneralPanel } from "./general-settings";
import { GitSettingsPanel } from "./git-settings";
import { McpSettingsPanel } from "./mcp";
import { NetworkProxySettingsPanel } from "./network-proxy-settings";
import type { NotificationSettings } from "./notifications";
import { OssLicensesSettingsPanel } from "./oss-licenses";
import { ProjectSettingsPanel } from "./projects";
import { ProviderSettingsPanel } from "./providers";
import { SettingRow, SettingsGroup } from "./settings-fields";
import { settingsSections } from "./settings-sections";
import { SettingsSidebar } from "./settings-sidebar";
import { SkillsSettingsPanel } from "./skills-settings";
import type { AppearanceSettings, ThemeMode } from "./theme";
import { WorkflowSettingsPanel } from "./workflows";
import { WorktreeSettingsPanel } from "./worktrees";

interface SettingsScreenProps {
  activeSection: SettingsSectionId;
  appearanceSettings: AppearanceSettings;
  canGoBack: boolean;
  canGoForward: boolean;
  chatLayoutMode: ChatLayoutMode;
  hideFabWhenClosed: boolean;
  languageMode: LanguageMode;
  notificationSettings: NotificationSettings;
  isSidebarOpen: boolean;
  sidebarWidth?: number;
  onGoBack(): void;
  onGoForward(): void;
  onAppearanceSettingsChange(settings: AppearanceSettings): void;
  onChatLayoutModeChange(mode: ChatLayoutMode): void;
  onHideFabWhenClosedChange(hide: boolean): void;
  onLanguageModeChange(languageMode: LanguageMode): void;
  onNotificationSettingsChange(settings: NotificationSettings): void;
  onResizeSidebar?(event: MouseEvent): void;
  onSectionChange(sectionId: SettingsSectionId): void;
  onThemeModeChange(themeMode: ThemeMode): void;
  onToggleSidebar(): void;
  themeMode: ThemeMode;
}

function SectionPanel({
  appearanceSettings,
  chatLayoutMode,
  hideFabWhenClosed,
  languageMode,
  notificationSettings,
  onAppearanceSettingsChange,
  onChatLayoutModeChange,
  onHideFabWhenClosedChange,
  onLanguageModeChange,
  onNotificationSettingsChange,
  onThemeModeChange,
  sectionId,
  themeMode,
}: {
  appearanceSettings: AppearanceSettings;
  chatLayoutMode: ChatLayoutMode;
  hideFabWhenClosed: boolean;
  languageMode: LanguageMode;
  notificationSettings: NotificationSettings;
  onAppearanceSettingsChange(settings: AppearanceSettings): void;
  onChatLayoutModeChange(mode: ChatLayoutMode): void;
  onHideFabWhenClosedChange(hide: boolean): void;
  onLanguageModeChange(languageMode: LanguageMode): void;
  onNotificationSettingsChange(settings: NotificationSettings): void;
  onThemeModeChange(themeMode: ThemeMode): void;
  sectionId: SettingsSectionId;
  themeMode: ThemeMode;
}) {
  const { t } = useTranslation("settings");
  const section = settingsSections.find((item) => item.id === sectionId);

  if (sectionId === "general") {
    return (
      <GeneralPanel
        chatLayoutMode={chatLayoutMode}
        hideFabWhenClosed={hideFabWhenClosed}
        languageMode={languageMode}
        notificationSettings={notificationSettings}
        onChatLayoutModeChange={onChatLayoutModeChange}
        onHideFabWhenClosedChange={onHideFabWhenClosedChange}
        onLanguageModeChange={onLanguageModeChange}
        onNotificationSettingsChange={onNotificationSettingsChange}
      />
    );
  }

  if (sectionId === "archived") {
    return (
      <div className="settings-panel-enter flex min-h-0 flex-1 flex-col">
        <ArchivedSessionsPanel />
      </div>
    );
  }

  if (sectionId === "shortcuts") {
    return <ShortcutsSettingsPanel />;
  }

  if (sectionId === "appearance") {
    return (
      <AppearancePanel
        appearanceSettings={appearanceSettings}
        onAppearanceSettingsChange={onAppearanceSettingsChange}
        onThemeModeChange={onThemeModeChange}
        themeMode={themeMode}
      />
    );
  }

  if (sectionId === "editor") {
    return <EditorSettingsPanel />;
  }

  if (sectionId === "providers") {
    return <ProviderSettingsPanel />;
  }

  if (sectionId === "adapters") {
    return <AdapterSettingsPanel />;
  }

  if (sectionId === "agentRoles") {
    return <AgentRoleSettingsPanel />;
  }

  if (sectionId === "mcp") {
    return <McpSettingsPanel />;
  }

  if (sectionId === "skills") {
    return <SkillsSettingsPanel />;
  }

  if (sectionId === "workflows") {
    return (
      <div className="settings-panel-enter flex min-h-0 flex-1 flex-col">
        <WorkflowSettingsPanel />
      </div>
    );
  }

  if (sectionId === "environment") {
    return <NetworkProxySettingsPanel />;
  }

  if (sectionId === "git") {
    return <GitSettingsPanel />;
  }

  if (sectionId === "worktrees") {
    return <WorktreeSettingsPanel />;
  }

  if (sectionId === "projects") {
    return <ProjectSettingsPanel />;
  }

  if (sectionId === "about") {
    return (
      <div className="settings-panel-enter flex flex-col gap-8">
        <SettingsGroup>
          <AppUpdateSettingsPanel />
        </SettingsGroup>
      </div>
    );
  }

  if (sectionId === "licenses") {
    return (
      <div className="settings-panel-enter flex min-h-0 flex-1 flex-col">
        <OssLicensesSettingsPanel />
      </div>
    );
  }

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup>
        <SettingRow
          description={t("placeholder.description")}
          title={t("placeholder.title", {
            section: section
              ? t(`sections.${section.labelKey}`)
              : t("sections.general"),
          })}
        />
      </SettingsGroup>
    </div>
  );
}

export function SettingsScreen({
  activeSection,
  appearanceSettings,
  canGoBack,
  canGoForward,
  chatLayoutMode,
  hideFabWhenClosed,
  isSidebarOpen,
  languageMode,
  notificationSettings,
  sidebarWidth,
  onGoBack,
  onGoForward,
  onAppearanceSettingsChange,
  onChatLayoutModeChange,
  onHideFabWhenClosedChange,
  onLanguageModeChange,
  onNotificationSettingsChange,
  onResizeSidebar,
  onSectionChange,
  onThemeModeChange,
  onToggleSidebar,
  themeMode,
}: SettingsScreenProps) {
  const { t } = useTranslation(["editor", "settings"]);
  const coreSections = settingsSections.filter(
    (section) => section.group === "core",
  );
  const activeSectionMeta =
    settingsSections.find((section) => section.id === activeSection) ??
    settingsSections[0];
  const isFillLayout =
    activeSection === "licenses" ||
    activeSection === "archived" ||
    activeSection === "workflows";
  const settingsHeading = (
    <header className="shrink-0">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {t(`settings:sections.${activeSectionMeta.labelKey}`)}
      </h1>
    </header>
  );
  const settingsPanel = (
    <SectionPanel
      appearanceSettings={appearanceSettings}
      chatLayoutMode={chatLayoutMode}
      hideFabWhenClosed={hideFabWhenClosed}
      languageMode={languageMode}
      notificationSettings={notificationSettings}
      onAppearanceSettingsChange={onAppearanceSettingsChange}
      onChatLayoutModeChange={onChatLayoutModeChange}
      onHideFabWhenClosedChange={onHideFabWhenClosedChange}
      onLanguageModeChange={onLanguageModeChange}
      onNotificationSettingsChange={onNotificationSettingsChange}
      onThemeModeChange={onThemeModeChange}
      sectionId={activeSection}
      themeMode={themeMode}
    />
  );

  return (
    <main className="relative flex h-screen overflow-hidden bg-background text-foreground">
      {isSidebarOpen ? (
        <ResizableSidebarSlot
          isOpen={isSidebarOpen}
          separatorAriaLabel={t("settings:sidebar.resize")}
          width={sidebarWidth ?? 240}
          onResizeMouseDown={(event) => onResizeSidebar?.(event)}
        >
          <SettingsSidebar
            activeSection={activeSection}
            coreSections={coreSections}
            sidebarWidth={sidebarWidth}
            onSectionChange={onSectionChange}
          />
        </ResizableSidebarSlot>
      ) : null}

      <section className="min-w-0 flex-1 overflow-hidden bg-background">
        <div className="flex h-8 shrink-0">
          <div className="w-32 shrink-0" />
          <div className="app-drag min-w-0 flex-1" />
        </div>
        {isFillLayout ? (
          <div className="flex h-[calc(100vh-2rem)] min-h-0 flex-col pb-8">
            <div
              className={cn(
                "mx-auto flex min-h-0 w-full flex-1 flex-col px-4 pt-10 sm:px-6 lg:px-8",
                activeSection === "workflows" && "max-w-none gap-4",
                activeSection === "licenses" && "max-w-5xl gap-6",
                activeSection !== "workflows" &&
                  activeSection !== "licenses" &&
                  "max-w-3xl gap-8",
              )}
            >
              {settingsHeading}
              {settingsPanel}
            </div>
          </div>
        ) : (
          <div className="h-[calc(100vh-2rem)] pb-8">
            <ScrollArea className="h-full">
              <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-4 pt-10 pb-10 sm:px-6 lg:px-8">
                {settingsHeading}
                {settingsPanel}
              </div>
            </ScrollArea>
          </div>
        )}
      </section>

      {/*
        Mirror app-shell left titlebar: same TITLEBAR_HEIGHT, traffic-light
        reserve, and gap-1 size-6 pills so controls do not jump when leaving
        settings.
      */}
      <div
        className="absolute top-0 start-0 z-[100] flex items-center"
        style={{
          height: TITLEBAR_HEIGHT,
          paddingInlineStart: TITLEBAR_TRAFFIC_LIGHT_RESERVE,
        }}
      >
        <div className="app-no-drag flex items-center gap-1">
          <SidebarToggleButton
            ariaLabel={t("editor:actions.toggleSidebar")}
            onToggle={onToggleSidebar}
          />
          <ScreenNavButtons
            backLabel={t("editor:actions.goBack")}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            forwardLabel={t("editor:actions.goForward")}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
          />
        </div>
      </div>
    </main>
  );
}

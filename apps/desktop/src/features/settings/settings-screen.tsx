import { useAtom } from "jotai";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout";
import {
  type ChatLayoutMode,
  chatLayoutModes,
  ResizableSidebarSlot,
  ScreenNavButtons,
  SidebarToggleButton,
} from "@/app/layout";
import {
  TITLEBAR_HEIGHT,
  TITLEBAR_TRAFFIC_LIGHT_RESERVE,
} from "@/app/layout/app-shell/app-shell-layout";
import { ScrollArea, Switch } from "@/components/ui";
import {
  type ActivityDisplayMode,
  activityDisplayModes,
  chatDisplaySettingsAtom,
  followUpBehaviorAtom,
  followUpBehaviors,
  isFollowUpBehavior,
} from "@/features/agent";
import { AppUpdateSettingsPanel } from "@/features/app-update";
import {
  isSendShortcut,
  sendShortcutAtom,
  sendShortcuts,
} from "@/features/composer";
import {
  ShortcutsSettingsPanel,
  useResolvedShortcutLabel,
} from "@/features/shortcuts";
import type { LanguageMode } from "@/i18n/language";
import { formatShortcutLabel } from "@/lib";
import { AdapterSettingsPanel } from "./adapters";
import { AppearancePanel } from "./appearance-settings";
import { CliPathSettingsPanel } from "./cli-path-settings";
import { DaemonSettingsPanel } from "./daemon-settings";
import { GitSettingsPanel } from "./git-settings";
import { LanguagePicker } from "./language-picker";
import { McpSettingsPanel } from "./mcp";
import { NetworkProxySettingsPanel } from "./network-proxy-settings";
import type { NotificationSettings } from "./notifications";
import { OssLicensesSettingsPanel } from "./oss-licenses";
import { ProviderSettingsPanel } from "./providers";
import { settingsSections } from "./settings-sections";
import { SettingsSelect } from "./settings-select";
import { SettingsSidebar } from "./settings-sidebar";
import { SkillsSettingsPanel } from "./skills-settings";
import type { AppearanceSettings, ThemeMode } from "./theme";

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

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex flex-col">
      {title ? (
        <div className="mb-2 px-1 text-meta font-medium text-muted-foreground/60">
          {title}
        </div>
      ) : null}
      <div className="rounded-card border border-border/40 bg-card/45 px-4">
        <div className="flex flex-col divide-y divide-border/30">
          {children}
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-body text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralPanel({
  chatLayoutMode,
  hideFabWhenClosed,
  languageMode,
  notificationSettings,
  onChatLayoutModeChange,
  onHideFabWhenClosedChange,
  onLanguageModeChange,
  onNotificationSettingsChange,
}: {
  chatLayoutMode: ChatLayoutMode;
  hideFabWhenClosed: boolean;
  languageMode: LanguageMode;
  notificationSettings: NotificationSettings;
  onChatLayoutModeChange(mode: ChatLayoutMode): void;
  onHideFabWhenClosedChange(hide: boolean): void;
  onLanguageModeChange(languageMode: LanguageMode): void;
  onNotificationSettingsChange(settings: NotificationSettings): void;
}) {
  const { t } = useTranslation("settings");
  const [chatDisplay, setChatDisplay] = useAtom(chatDisplaySettingsAtom);
  const [followUpBehavior, setFollowUpBehavior] = useAtom(followUpBehaviorAtom);
  const [sendShortcut, setSendShortcut] = useAtom(sendShortcutAtom);
  const activityOptions = activityDisplayModes.map((value) => ({
    label: t(`chatDisplay.activity.options.${value}`),
    value,
  }));
  const layoutOptions = chatLayoutModes.map((value) => ({
    label: t(`chatDisplay.layout.options.${value}`),
    value,
  }));
  const followUpOptions = followUpBehaviors.map((value) => ({
    label: t(`followUp.options.${value}`),
    value,
  }));
  const primaryEnterShortcut = formatShortcutLabel({
    key: "Enter",
    primary: true,
  });
  const oppositeFollowUpShortcut = formatShortcutLabel({
    key: "Enter",
    primary: true,
    shift: sendShortcut !== "enter",
  });
  const sendShortcutOptions = sendShortcuts.map((value) => ({
    label: t(`sendShortcut.options.${value}`, {
      shortcut: primaryEnterShortcut,
    }),
    value,
  }));
  const toggleChatShortcut = useResolvedShortcutLabel("toggleChatDock");

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup title={t("chatDisplay.groupTitle")}>
        <SettingRow
          description={t("chatDisplay.layout.description")}
          title={t("chatDisplay.layout.title")}
        >
          <SettingsSelect
            ariaLabel={t("chatDisplay.layout.title")}
            compact
            options={layoutOptions}
            value={chatLayoutMode}
            onChange={(value) => {
              if (
                value === "center" ||
                value === "float" ||
                value === "pinned"
              ) {
                onChatLayoutModeChange(value);
              }
            }}
          />
        </SettingRow>
        <SettingRow
          description={t("chatDisplay.hideFab.description", {
            shortcut: toggleChatShortcut || t("shortcuts.unbound"),
          })}
          title={t("chatDisplay.hideFab.title")}
        >
          <Switch
            checked={hideFabWhenClosed}
            onCheckedChange={onHideFabWhenClosedChange}
          />
        </SettingRow>
        <SettingRow
          description={t("chatDisplay.activity.description")}
          title={t("chatDisplay.activity.title")}
        >
          <SettingsSelect
            ariaLabel={t("chatDisplay.activity.title")}
            compact
            options={activityOptions}
            value={chatDisplay.activityDisplay}
            onChange={(value) =>
              setChatDisplay({
                ...chatDisplay,
                activityDisplay: value as ActivityDisplayMode,
              })
            }
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("followUp.groupTitle")}>
        <SettingRow
          description={t("sendShortcut.description")}
          title={t("sendShortcut.title")}
        >
          <SettingsSelect
            ariaLabel={t("sendShortcut.title")}
            compact
            options={sendShortcutOptions}
            value={sendShortcut}
            onChange={(value) => {
              if (isSendShortcut(value)) setSendShortcut(value);
            }}
          />
        </SettingRow>
        <SettingRow
          description={t("followUp.description", {
            shortcut: oppositeFollowUpShortcut,
          })}
          title={t("followUp.title")}
        >
          <SettingsSelect
            ariaLabel={t("followUp.title")}
            compact
            options={followUpOptions}
            value={followUpBehavior}
            onChange={(value) => {
              if (isFollowUpBehavior(value)) setFollowUpBehavior(value);
            }}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("language.groupTitle")}>
        <SettingRow
          description={t("language.description")}
          title={t("language.title")}
        >
          <LanguagePicker
            value={languageMode}
            onChange={onLanguageModeChange}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("notifications.groupTitle")}>
        <SettingRow
          description={t("notifications.systemNotifications.description")}
          title={t("notifications.systemNotifications.title")}
        >
          <Switch
            checked={notificationSettings.systemNotifications}
            onCheckedChange={(systemNotifications) =>
              onNotificationSettingsChange({
                ...notificationSettings,
                systemNotifications,
              })
            }
          />
        </SettingRow>
        <SettingRow
          description={t("notifications.completionSound.description")}
          title={t("notifications.completionSound.title")}
        >
          <Switch
            checked={notificationSettings.completionSound}
            onCheckedChange={(completionSound) =>
              onNotificationSettingsChange({
                ...notificationSettings,
                completionSound,
              })
            }
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("cli.groupTitle")}>
        <CliPathSettingsPanel />
      </SettingsGroup>

      <SettingsGroup title={t("daemon.groupTitle")}>
        <DaemonSettingsPanel />
      </SettingsGroup>
    </div>
  );
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

  if (sectionId === "providers") {
    return <ProviderSettingsPanel />;
  }

  if (sectionId === "adapters") {
    return <AdapterSettingsPanel />;
  }

  if (sectionId === "mcp") {
    return <McpSettingsPanel />;
  }

  if (sectionId === "skills") {
    return <SkillsSettingsPanel />;
  }

  if (sectionId === "environment") {
    return <NetworkProxySettingsPanel />;
  }

  if (sectionId === "git") {
    return <GitSettingsPanel />;
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
  const isFillLayout = activeSection === "licenses";
  const settingsHeading = (
    <header>
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
            <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-10 sm:px-6 lg:px-8">
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

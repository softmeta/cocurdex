import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { type ChatLayoutMode, chatLayoutModes } from "@/app/layout";
import { Switch } from "@/components/ui";
import {
  type ActivityDisplayMode,
  activityDisplayModes,
  chatDisplaySettingsAtom,
  followUpBehaviorAtom,
  followUpBehaviors,
  isFollowUpBehavior,
} from "@/features/agent";
import {
  isSendShortcut,
  sendShortcutAtom,
  sendShortcuts,
} from "@/features/composer";
import { useResolvedShortcutLabel } from "@/features/shortcuts";
import type { LanguageMode } from "@/i18n/language";
import { formatShortcutLabel, htmlPreviewLocationAtom } from "@/lib";
import { CliPathSettingsPanel } from "./cli-path-settings";
import { DaemonSettingsPanel } from "./daemon-settings";
import { LanguagePicker } from "./language-picker";
import type { NotificationSettings } from "./notifications";
import { SettingRow, SettingsGroup } from "./settings-fields";
import { SettingsSelect } from "./settings-select";

export function GeneralPanel({
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
  const [htmlLocation, setHtmlLocation] = useAtom(htmlPreviewLocationAtom);
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
        <SettingRow
          title={t("chatDisplay.htmlPreview.title")}
          description={t("chatDisplay.htmlPreview.description")}
        >
          <SettingsSelect
            ariaLabel={t("chatDisplay.htmlPreview.title")}
            compact
            value={htmlLocation}
            options={[
              {
                value: "chat",
                label: t("chatDisplay.htmlPreview.options.chat"),
              },
              {
                value: "browser",
                label: t("chatDisplay.htmlPreview.options.browser"),
              },
            ]}
            onChange={(value) => {
              if (value === "chat" || value === "browser")
                setHtmlLocation(value);
            }}
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

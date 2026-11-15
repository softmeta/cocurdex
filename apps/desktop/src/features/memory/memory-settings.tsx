import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingRow, SettingsGroup } from "@/components/app";
import { Switch } from "@/components/ui";
import { desktopApi } from "@/lib";
import {
  revalidateMemory,
  useMemorySettings,
  useMemoryStatus,
} from "./memory-queries";
import { MemoryRsrsSettings } from "./memory-rsrs-settings";

export function MemorySettingsPanel() {
  const { t } = useTranslation("memory");
  const { data: status } = useMemoryStatus();
  const { data: settingsData } = useMemorySettings();
  const settings = settingsData ?? DEFAULT_MEMORY_SETTINGS;
  const unsupported = status?.supported === false;
  const usesRsrs = settings.enabled && settings.rsrs;

  const save = async (next: MemorySettings) => {
    try {
      await desktopApi.setMemorySettings(next);
      await revalidateMemory();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("settings.saveFailed"),
      );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title={t("settings.groupTitle")}>
        <SettingRow
          searchId="memory.enabled"
          description={t("settings.enabled.description")}
          title={t("settings.enabled.title")}
        >
          <Switch
            aria-label={t("settings.enabled.title")}
            checked={settings.enabled}
            onCheckedChange={(enabled) => void save({ ...settings, enabled })}
          />
        </SettingRow>
        <SettingRow
          searchId="memory.agentContext"
          description={t("settings.agentContext.description")}
          title={t("settings.agentContext.title")}
        >
          <Switch
            aria-label={t("settings.agentContext.title")}
            checked={settings.agent.injectContext}
            disabled={!settings.enabled}
            onCheckedChange={(injectContext) =>
              void save({
                ...settings,
                agent: { ...settings.agent, injectContext },
              })
            }
          />
        </SettingRow>
        <SettingRow
          searchId="memory.agentTools"
          description={t("settings.agentTools.description")}
          title={t("settings.agentTools.title")}
        >
          <Switch
            aria-label={t("settings.agentTools.title")}
            checked={settings.agent.tools}
            disabled={!settings.enabled}
            onCheckedChange={(tools) =>
              void save({ ...settings, agent: { ...settings.agent, tools } })
            }
          />
        </SettingRow>
        {status?.userLibrary.detected ? (
          <SettingRow
            searchId="memory.userLibrary"
            description={t("settings.userLibrary.description")}
            title={t("settings.userLibrary.title")}
          >
            <Switch
              aria-label={t("settings.userLibrary.title")}
              checked={settings.userLibrary}
              disabled={!settings.enabled}
              onCheckedChange={(userLibrary) =>
                void save({ ...settings, userLibrary })
              }
            />
          </SettingRow>
        ) : null}
        <SettingRow
          searchId="memory.chatRecall"
          description={t("settings.chatRecall.description")}
          title={t("settings.chatRecall.title")}
        >
          <Switch
            aria-label={t("settings.chatRecall.title")}
            checked={settings.chat.recall}
            disabled={!settings.enabled}
            onCheckedChange={(recall) =>
              void save({ ...settings, chat: { ...settings.chat, recall } })
            }
          />
        </SettingRow>
        <SettingRow
          searchId="memory.chatSaveOnEnd"
          description={t("settings.chatSaveOnEnd.description")}
          title={t("settings.chatSaveOnEnd.title")}
        >
          <Switch
            aria-label={t("settings.chatSaveOnEnd.title")}
            checked={settings.chat.saveOnEnd}
            disabled={!settings.enabled}
            onCheckedChange={(saveOnEnd) =>
              void save({ ...settings, chat: { ...settings.chat, saveOnEnd } })
            }
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.rsrsTitle")}>
        <SettingRow
          searchId="memory.rsrs"
          description={
            unsupported
              ? t("settings.rsrs.unsupported")
              : t("settings.rsrs.description")
          }
          title={t("settings.rsrs.title")}
        >
          <Switch
            aria-label={t("settings.rsrs.title")}
            checked={settings.rsrs}
            disabled={!settings.enabled || unsupported}
            onCheckedChange={(rsrs) => void save({ ...settings, rsrs })}
          />
        </SettingRow>
      </SettingsGroup>

      {usesRsrs ? (
        <MemoryRsrsSettings save={save} settings={settings} status={status} />
      ) : null}
    </div>
  );
}

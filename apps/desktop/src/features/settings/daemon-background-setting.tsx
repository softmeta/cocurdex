import type { DaemonBackgroundStatus } from "@cocurdex/rpc";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingRow } from "@/components/app";
import { Switch } from "@/components/ui";
import { desktopApi } from "@/lib";

export function DaemonBackgroundSetting({
  status,
  onChanged,
}: {
  status: DaemonBackgroundStatus;
  onChanged(next: DaemonBackgroundStatus): void;
}) {
  const { t } = useTranslation("settings");
  const [saving, setSaving] = useState(false);

  const save = async (enabled: boolean) => {
    setSaving(true);
    try {
      onChanged(await desktopApi.setDaemonBackground(enabled));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("daemon.background.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow
      searchId="general.daemonBackground"
      description={t("daemon.background.description")}
      title={t("daemon.background.title")}
    >
      <Switch
        aria-label={t("daemon.background.title")}
        checked={status.enabled}
        disabled={saving}
        onCheckedChange={(enabled) => void save(enabled)}
      />
    </SettingRow>
  );
}

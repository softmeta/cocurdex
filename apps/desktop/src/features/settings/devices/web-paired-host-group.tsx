import { type SavedHost, savedHostSafetyCode } from "@cocurdex/client-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow, SettingsGroup } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { removePairedHost, requestDaemon } from "@/lib";
import { useFormatDateTime } from "./host-access-labels";

export function WebPairedHostGroup({ host }: { host: SavedHost }) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  const [unpairing, setUnpairing] = useState(false);
  const [failed, setFailed] = useState(false);

  const unpair = async () => {
    setUnpairing(true);
    setFailed(false);
    await requestDaemon("host.devices.revokeSelf").catch(() => null);
    try {
      await removePairedHost(host.hostId);
      window.location.reload();
    } catch {
      setFailed(true);
      setUnpairing(false);
    }
  };

  return (
    <SettingsGroup
      description={t("devices.webPaired.description", { name: host.name })}
      title={t("devices.webPaired.title")}
    >
      <SettingRow title={t("devices.webPaired.computer")}>
        <Text size="body">{host.name}</Text>
      </SettingRow>
      <SettingRow
        description={t("devices.webPaired.safetyCodeDescription")}
        title={t("devices.webPaired.safetyCode")}
      >
        <Text className="font-mono" size="body">
          {savedHostSafetyCode(host)}
        </Text>
      </SettingRow>
      <SettingRow title={t("devices.webPaired.pairedAt")}>
        <Text size="body" tone="muted">
          {formatDateTime(host.pairedAt)}
        </Text>
      </SettingRow>
      <SettingRow
        description={t("devices.webPaired.unpairDescription")}
        title={t("devices.webPaired.unpair")}
      >
        <div className="flex flex-col items-end gap-1">
          <Button
            disabled={unpairing}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void unpair()}
          >
            {t("devices.webPaired.unpair")}
          </Button>
          {failed ? (
            <Text size="meta" tone="destructive">
              {t("devices.webPaired.unpairFailed")}
            </Text>
          ) : null}
        </div>
      </SettingRow>
    </SettingsGroup>
  );
}

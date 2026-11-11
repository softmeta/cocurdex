import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow, SettingsGroup } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { requestDaemon } from "@/lib";
import { useFormatDateTime } from "./host-access-labels";

export interface PairedHostSummary {
  name: string;
  safetyCode: string;
  pairedAt: string;
  forget?: () => Promise<void>;
}

export function WebPairedHostGroup({ host }: { host: PairedHostSummary }) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  const [unpairing, setUnpairing] = useState(false);
  const [failed, setFailed] = useState(false);

  const { forget } = host;
  const unpair = async (forgetHost: () => Promise<void>) => {
    setUnpairing(true);
    setFailed(false);
    await requestDaemon("host.devices.revokeSelf").catch(() => null);
    try {
      await forgetHost();
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
          {host.safetyCode}
        </Text>
      </SettingRow>
      <SettingRow title={t("devices.webPaired.pairedAt")}>
        <Text size="body" tone="muted">
          {formatDateTime(host.pairedAt)}
        </Text>
      </SettingRow>
      {forget ? (
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
              onClick={() => void unpair(forget)}
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
      ) : null}
    </SettingsGroup>
  );
}

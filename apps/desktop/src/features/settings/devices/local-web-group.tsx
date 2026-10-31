import type { DaemonConnectionInfo } from "@cocurdex/rpc";
import { buildLocalWebClientUrl } from "@cocurdex/shared";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingRow, SettingsGroup } from "@/components/app";
import { Button } from "@/components/ui";
import { buildDevWebClientUrl, desktopApi } from "@/lib";

function localWebClientUrl(connection: DaemonConnectionInfo) {
  if (import.meta.env.DEV) {
    return buildDevWebClientUrl(window.location.origin, connection);
  }
  return buildLocalWebClientUrl(connection.webSocketUrl, connection.token);
}

async function openLocalWebClient() {
  const connection = await desktopApi.getDaemonConnection();
  if (!connection) throw new Error("Daemon is not running");
  await desktopApi.openExternal(localWebClientUrl(connection));
}

export function LocalWebGroup() {
  const { t } = useTranslation("settings");

  if (!desktopApi.capabilities.localWebClient) return null;

  return (
    <SettingsGroup title={t("devices.localWeb.groupTitle")}>
      <SettingRow
        description={t("devices.localWeb.open.description")}
        title={t("devices.localWeb.open.title")}
      >
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            openLocalWebClient().catch(() => {
              toast.error(t("devices.localWeb.openFailed"));
            });
          }}
        >
          <ExternalLink className="size-3.5" />
          {t("devices.localWeb.open.action")}
        </Button>
      </SettingRow>
    </SettingsGroup>
  );
}

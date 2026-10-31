import {
  DEFAULT_REMOTE_ACCESS_PORT,
  type HostRemoteAccessStatus,
  type RemoteAccessSettingsUpdate,
} from "@cocurdex/shared";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AppCopyButton,
  SettingNumberInput,
  SettingRow,
  SettingsGroup,
} from "@/components/app";
import { Badge, Switch, Text } from "@/components/ui";
import { desktopApi } from "@/lib";

function parsePort(value: string) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : null;
}

export function RemoteAccessGroup({
  status,
  onChanged,
}: {
  status: HostRemoteAccessStatus;
  onChanged(next: HostRemoteAccessStatus): void;
}) {
  const { t } = useTranslation("settings");
  const [portDraft, setPortDraft] = useState(String(status.settings.port));
  const [saving, setSaving] = useState(false);

  const save = async (update: RemoteAccessSettingsUpdate) => {
    setSaving(true);
    try {
      onChanged(await desktopApi.setHostRemoteAccess(update));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("devices.remote.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const commitPort = () => {
    const port = parsePort(portDraft);
    if (port === null) {
      toast.error(t("devices.remote.invalidPort"));
      setPortDraft(String(status.settings.port));
      return;
    }
    if (port !== status.settings.port) {
      void save({ enabled: status.settings.enabled, port });
    }
  };

  return (
    <SettingsGroup
      description={t("devices.remote.groupDescription")}
      title={t("devices.remote.groupTitle")}
    >
      <SettingRow
        description={t("devices.remote.enable.description")}
        title={t("devices.remote.enable.title")}
      >
        <Switch
          checked={status.settings.enabled}
          disabled={saving}
          onCheckedChange={(enabled) =>
            void save({ enabled, port: status.settings.port })
          }
        />
      </SettingRow>
      <SettingRow
        description={t("devices.remote.keepAwake.description")}
        title={t("devices.remote.keepAwake.title")}
      >
        <Switch
          aria-label={t("devices.remote.keepAwake.title")}
          checked={status.settings.keepAwake}
          disabled={saving || !status.settings.enabled}
          onCheckedChange={(keepAwake) =>
            void save({ ...status.settings, keepAwake })
          }
        />
      </SettingRow>
      <SettingRow
        description={t("devices.remote.port.description", {
          port: DEFAULT_REMOTE_ACCESS_PORT,
        })}
        title={t("devices.remote.port.title")}
      >
        <SettingNumberInput
          aria-label={t("devices.remote.port.title")}
          disabled={saving}
          inputMode="numeric"
          value={portDraft}
          onChange={(event) => setPortDraft(event.target.value)}
          onCommit={commitPort}
        />
      </SettingRow>
      {status.error ? (
        <div className="py-3.5">
          <Text size="body" tone="destructive">
            {t("devices.remote.error", { error: status.error })}
          </Text>
        </div>
      ) : null}
      {status.listening ? (
        <div className="flex flex-col gap-2 py-3.5">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
            <Text size="body" tone="muted">
              {t("devices.remote.plaintextWarning")}
            </Text>
          </div>
          {status.addresses.length === 0 ? (
            <Text size="meta" tone="muted">
              {t("devices.remote.noAddresses")}
            </Text>
          ) : null}
          {status.addresses.some(
            (address) => address.kind === "tailscale",
          ) ? null : (
            <Text size="meta" tone="muted">
              {t("devices.remote.awayHint")}
            </Text>
          )}
          {status.addresses.map((address) => (
            <div className="flex min-w-0 items-center gap-2" key={address.url}>
              <Badge variant="outline">
                {address.kind === "tailscale"
                  ? t("devices.remote.kind.tailscale")
                  : t("devices.remote.kind.lan")}
              </Badge>
              <Text className="min-w-0 flex-1 font-mono" size="meta" truncate>
                {address.url}
              </Text>
              <AppCopyButton value={address.url} />
            </div>
          ))}
        </div>
      ) : null}
    </SettingsGroup>
  );
}

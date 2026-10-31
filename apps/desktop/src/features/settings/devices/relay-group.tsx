import {
  type HostRelayError,
  type HostRelayState,
  type HostRemoteAccessStatus,
  normalizeRelayUrl,
  parseRelayCredential,
  type RelaySettingsUpdate,
} from "@cocurdex/shared";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppCopyButton, SettingRow, SettingsGroup } from "@/components/app";
import { Badge, Button, Input, Switch, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { useFormatDateTime } from "./host-access-labels";

function useRelayLabels() {
  const { t } = useTranslation("settings");
  const states: Record<HostRelayState, string> = {
    off: t("devices.relay.state.off"),
    connecting: t("devices.relay.state.connecting"),
    online: t("devices.relay.state.online"),
    offline: t("devices.relay.state.offline"),
  };
  const errors: Record<HostRelayError, string> = {
    unreachable: t("devices.relay.error.unreachable"),
    credentialRequired: t("devices.relay.error.credentialRequired"),
    routeTaken: t("devices.relay.error.routeTaken"),
    rateLimited: t("devices.relay.error.rateLimited"),
    unauthorized: t("devices.relay.error.unauthorized"),
    protocol: t("devices.relay.error.protocol"),
  };
  return { states, errors };
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.currentTarget.blur();
}

export function RelayGroup({
  status,
  onChanged,
}: {
  status: HostRemoteAccessStatus;
  onChanged(): void;
}) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  const labels = useRelayLabels();
  const { relay } = status;
  const [urlDraft, setUrlDraft] = useState(relay.url ?? "");
  const [urlError, setUrlError] = useState(false);
  const [credentialDraft, setCredentialDraft] = useState("");
  const [credentialError, setCredentialError] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (update: RelaySettingsUpdate) => {
    setSaving(true);
    try {
      await desktopApi.setHostRelay(update);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("devices.relay.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const commitUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) {
      setUrlError(false);
      if (relay.url) void save({ url: null });
      return;
    }
    const url = normalizeRelayUrl(trimmed);
    setUrlError(url === null);
    if (url && url !== relay.url) void save({ url });
  };

  const commitCredential = () => {
    if (!credentialDraft.trim()) {
      setCredentialError(false);
      return;
    }
    const credential = parseRelayCredential(credentialDraft);
    setCredentialError(credential === null);
    if (!credential) return;
    setCredentialDraft("");
    void save({ url: relay.url, credential });
  };

  const stateLabel = status.settings.enabled
    ? labels.states[relay.state]
    : t("devices.relay.state.remoteOff");

  return (
    <SettingsGroup
      description={t("devices.relay.groupDescription")}
      title={t("devices.relay.groupTitle")}
    >
      <SettingRow
        description={t("devices.relay.url.description")}
        title={t("devices.relay.url.title")}
      >
        <div className="flex w-72 flex-col gap-1">
          <Input
            aria-label={t("devices.relay.url.title")}
            disabled={saving}
            placeholder={t("devices.relay.url.placeholder")}
            value={urlDraft}
            onBlur={commitUrl}
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={blurOnEnter}
          />
          {urlError ? (
            <Text size="meta" tone="destructive">
              {t("devices.relay.url.invalid")}
            </Text>
          ) : null}
        </div>
      </SettingRow>
      <SettingRow
        description={t("devices.relay.relayOnly.description")}
        title={t("devices.relay.relayOnly.title")}
      >
        <Switch
          aria-label={t("devices.relay.relayOnly.title")}
          checked={relay.relayOnly}
          disabled={saving || !relay.url}
          onCheckedChange={(relayOnly) =>
            void save({ url: relay.url, relayOnly })
          }
        />
      </SettingRow>
      <SettingRow
        description={t("devices.relay.credential.description")}
        title={t("devices.relay.credential.title")}
      >
        {relay.credential ? (
          <div className="flex items-center gap-2">
            <Text size="meta" tone="muted">
              {t("devices.relay.credential.summary", {
                account: relay.credential.accountId,
                expires: formatDateTime(
                  new Date(relay.credential.expiresAt * 1000).toISOString(),
                ),
              })}
            </Text>
            <Button
              disabled={saving}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void save({ url: relay.url, credential: null })}
            >
              {t("devices.relay.credential.remove")}
            </Button>
          </div>
        ) : (
          <div className="flex w-72 flex-col gap-1">
            <Input
              aria-label={t("devices.relay.credential.title")}
              disabled={saving || !relay.url}
              placeholder={t("devices.relay.credential.placeholder")}
              value={credentialDraft}
              onBlur={commitCredential}
              onChange={(event) => setCredentialDraft(event.target.value)}
              onKeyDown={blurOnEnter}
            />
            {credentialError ? (
              <Text size="meta" tone="destructive">
                {t("devices.relay.credential.invalid")}
              </Text>
            ) : null}
          </div>
        )}
      </SettingRow>
      {relay.url ? (
        <div className="flex flex-col gap-2 py-3.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t("devices.relay.state.title")}</Badge>
            <Text size="body">{stateLabel}</Text>
          </div>
          {relay.error ? (
            <Text size="body" tone="destructive">
              {labels.errors[relay.error]}
            </Text>
          ) : null}
          {relay.endpoint ? (
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="outline">{t("devices.remote.kind.relay")}</Badge>
              <Text className="min-w-0 flex-1 font-mono" size="meta" truncate>
                {relay.endpoint}
              </Text>
              <AppCopyButton value={relay.endpoint} />
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsGroup>
  );
}

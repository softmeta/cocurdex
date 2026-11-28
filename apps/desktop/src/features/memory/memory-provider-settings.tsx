import {
  AI_MEMORY_DEFAULT_SERVER_URL,
  AI_MEMORY_REPO_URL,
  isMemoryProviderId,
  type MemoryProviderId,
  type MemorySettings,
  type MemoryStatus,
  withMemoryProvider,
  withMemoryProviderSettings,
} from "@cocurdex/shared";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AppActivityTime,
  AppSelect,
  SettingRow,
  SettingsGroup,
} from "@/components/app";
import { Button, Input, Spinner, Switch, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { revalidateMemory } from "./memory-queries";
import { MemoryRsrsSettings } from "./memory-rsrs-settings";

const NONE = "none";

interface ProviderSettingsProps {
  settings: MemorySettings;
  status: MemoryStatus | undefined;
  save(next: MemorySettings): Promise<void>;
}

function ProviderPicker({ settings, status, save }: ProviderSettingsProps) {
  const { t } = useTranslation("memory");
  const rsrsUnsupported = status?.supported === false;
  const options = [
    { value: NONE, label: t("settings.provider.none") },
    {
      value: "rsrs",
      label: "rsrs",
      description: rsrsUnsupported
        ? t("settings.rsrs.unsupported")
        : t("settings.provider.rsrs"),
      disabled: rsrsUnsupported,
    },
    {
      value: "ai-memory",
      label: "ai-memory",
      description: t("settings.provider.aiMemory"),
    },
  ];
  const value = settings.provider ?? NONE;
  const selected = options.find((option) => option.value === value);
  return (
    <SettingRow
      searchId="memory.provider"
      description={t("settings.provider.description")}
      title={t("settings.provider.title")}
    >
      <AppSelect
        align="end"
        appearance="ghost"
        disabled={!settings.enabled}
        options={options}
        triggerAriaLabel={t("settings.provider.title")}
        triggerClassName="h-7 w-auto max-w-56 gap-1 px-2 font-normal"
        triggerLabel={selected?.label}
        triggerRadius="control"
        value={value}
        onValueChange={(next) => {
          const provider: MemoryProviderId | null = isMemoryProviderId(next)
            ? next
            : null;
          if (provider !== settings.provider) {
            void save(withMemoryProvider(settings, provider));
          }
        }}
      />
    </SettingRow>
  );
}

function ProviderSyncRow({ status }: { status: MemoryStatus | undefined }) {
  const { t } = useTranslation("memory");
  const [syncing, setSyncing] = useState(false);
  const provider = status?.provider ?? null;
  if (!provider) return null;

  const syncNow = async () => {
    setSyncing(true);
    try {
      const summary = await desktopApi.syncMemory();
      await revalidateMemory();
      if (summary.failed > 0) {
        toast.error(t("settings.sync.partial", { count: summary.failed }));
      } else {
        toast.success(t("settings.sync.done"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("settings.sync.failed"),
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <Text className="block" size="body" weight="medium">
          {t("settings.sync.title")}
        </Text>
        <Text className="mt-0.5 block" size="meta" tone="muted">
          {t("settings.sync.description")}
        </Text>
        {provider.lastSyncAt ? (
          <AppActivityTime timestamp={provider.lastSyncAt} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {syncing ? <Spinner size="md" /> : null}
        <Button
          disabled={syncing || !provider.available}
          size="sm"
          variant="outline"
          onClick={() => void syncNow()}
        >
          {t("settings.sync.action")}
        </Button>
      </div>
    </div>
  );
}

function AiMemorySettings({ settings, status, save }: ProviderSettingsProps) {
  const { t } = useTranslation("memory");
  const provider =
    status?.provider?.id === "ai-memory" ? status.provider : null;
  const serverUrl = settings.providers.aiMemory.serverUrl;
  return (
    <>
      <SettingsGroup title={t("settings.connectionTitle")}>
        <div className="min-w-0 py-3.5">
          <Text className="block" size="body" weight="medium">
            {t("settings.status.title")}
          </Text>
          {provider?.available ? (
            <Text className="mt-0.5 block" size="meta" tone="muted">
              {t("settings.aiMemory.available", {
                version: provider.version ?? t("settings.status.unknown"),
              })}
            </Text>
          ) : (
            <Text className="mt-0.5 block text-destructive" size="meta">
              {provider?.error ?? t("settings.aiMemory.unreachable")}
            </Text>
          )}
        </div>
        <SettingRow
          searchId="memory.aiMemoryServer"
          description={t("settings.aiMemory.server.description")}
          title={t("settings.aiMemory.server.title")}
        >
          <Input
            key={serverUrl ?? ""}
            aria-label={t("settings.aiMemory.server.title")}
            className="w-80"
            defaultValue={serverUrl ?? ""}
            placeholder={AI_MEMORY_DEFAULT_SERVER_URL}
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next !== serverUrl) {
                void save(
                  withMemoryProviderSettings(settings, {
                    aiMemory: { serverUrl: next },
                  }),
                );
              }
            }}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title={t("settings.aiMemory.aboutTitle")}>
        <SettingRow
          description={t("settings.aiMemory.repo.description")}
          title={t("settings.links.repo.title")}
        >
          <Button
            aria-label={t("settings.aiMemory.repo.action")}
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(AI_MEMORY_REPO_URL)}
          >
            <ExternalLink className="size-3.5" />
            {t("settings.links.open")}
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

export function MemoryProviderSettings(props: ProviderSettingsProps) {
  const { t } = useTranslation("memory");
  const { settings, status, save } = props;
  const provider = settings.enabled ? settings.provider : null;
  return (
    <>
      <SettingsGroup title={t("settings.provider.groupTitle")}>
        <ProviderPicker {...props} />
        {provider === "rsrs" && status?.userLibrary.detected ? (
          <SettingRow
            searchId="memory.userLibrary"
            description={t("settings.userLibrary.description")}
            title={t("settings.userLibrary.title")}
          >
            <Switch
              aria-label={t("settings.userLibrary.title")}
              checked={settings.providers.rsrs.userLibrary}
              onCheckedChange={(userLibrary) =>
                void save(
                  withMemoryProviderSettings(settings, {
                    rsrs: { userLibrary },
                  }),
                )
              }
            />
          </SettingRow>
        ) : null}
        {provider ? <ProviderSyncRow status={status} /> : null}
      </SettingsGroup>
      {provider === "rsrs" ? <MemoryRsrsSettings {...props} /> : null}
      {provider === "ai-memory" ? <AiMemorySettings {...props} /> : null}
    </>
  );
}

import {
  DEFAULT_MEMORY_CLOUD_STATUS,
  type MemoryCloudStatus,
  type MemorySettings,
  type MemoryStatus,
  RSRS_DASHBOARD_URL,
  RSRS_REPO_URL,
  RSRS_SITE_URL,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppActivityTime, SettingRow, SettingsGroup } from "@/components/app";
import { Button, Input, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { MemoryDoctorDetails } from "./memory-doctor-details";
import { revalidateMemory } from "./memory-queries";

function statusText(
  t: TFunction<"memory">,
  status: MemoryStatus | undefined,
  installing: boolean,
) {
  if (status?.supported === false) return t("settings.status.unsupported");
  if (installing) return t("settings.status.installing");
  if (status?.rsrsAvailable) {
    const version = status.version ?? t("settings.status.unknown");
    if (!status.runtimeVersion) {
      return t("settings.status.available", { version });
    }
    return t("settings.status.availableWithRuntime", {
      version,
      runtime: status.runtimeVersion,
    });
  }
  return t("settings.status.missing");
}

// A healthy install needs no setup run: the doctor action checks it. Setup
// reruns only to install a missing store or repair a failed one.
function memorySetupAction(status: MemoryStatus | undefined) {
  if (!status?.rsrsAvailable) return "install" as const;
  if (status.installBlocked || status.upgradeRequired) return null;
  if (status.installation === "failed" || status.error)
    return "repair" as const;
  return null;
}

function cloudDetail(t: TFunction<"memory">, cloud: MemoryCloudStatus) {
  if (cloud.error)
    return t("settings.cloud.syncFailed", { error: cloud.error });
  if (cloud.syncing) return t("settings.cloud.syncing");
  if (cloud.offline) return t("settings.cloud.offline");
  const parts: string[] = [];
  if (cloud.pending > 0) {
    parts.push(t("settings.cloud.pending", { count: cloud.pending }));
  }
  if (cloud.conflicts > 0) {
    parts.push(t("settings.cloud.conflicts", { count: cloud.conflicts }));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function MemoryRsrsSettings({
  settings,
  status,
  save,
}: {
  settings: MemorySettings;
  status: MemoryStatus | undefined;
  save(next: MemorySettings): Promise<void>;
}) {
  const { t } = useTranslation("memory");
  const [busy, setBusy] = useState(false);
  const installing = status?.installation === "installing";
  const unsupported = status?.supported === false;
  const setupAction = memorySetupAction(status);
  const cloud = status?.cloud ?? DEFAULT_MEMORY_CLOUD_STATUS;

  const runInstall = async () => {
    setBusy(true);
    try {
      const result = await desktopApi.installMemory(true);
      await revalidateMemory();
      if (result.installed) {
        toast.success(t("settings.installReady"));
      } else {
        toast.error(result.message ?? t("settings.installFailed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("settings.installFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const runDoctor = async () => {
    setBusy(true);
    try {
      const report = await desktopApi.runMemoryDoctor({ remote: true });
      await revalidateMemory();
      if (report.status === "fail") {
        toast.error(t("settings.doctorFailed"));
      } else {
        toast.success(t("settings.doctorPassed", { status: report.status }));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("settings.doctorFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const cloudDescription = !status?.rsrsAvailable
    ? t("settings.cloud.needsRsrs")
    : t("settings.cloud.managedByRsrs");
  const detail = cloudDetail(t, cloud);

  return (
    <>
      <SettingsGroup title={t("settings.cloudTitle")}>
        <SettingRow
          searchId="memory.cloud"
          description={cloudDescription}
          title={t("settings.cloud.title")}
        >
          <Button
            aria-label={t("settings.cloud.openDashboard")}
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(RSRS_DASHBOARD_URL)}
          >
            <ExternalLink className="size-3.5" />
            {t("settings.links.open")}
          </Button>
        </SettingRow>
        {status?.rsrsAvailable ? (
          <div className="min-w-0 py-3.5">
            <Text className="block" size="body" weight="medium">
              {cloud.connected
                ? t("settings.cloud.signedInAs", { user: cloud.user ?? "" })
                : t("settings.cloud.notSignedIn")}
            </Text>
            <Text className="mt-0.5 block" size="meta" tone="muted">
              {cloud.connected && cloud.autosync
                ? t("settings.cloud.autosyncOn")
                : t("settings.cloud.autosyncOff")}
            </Text>
            {cloud.server ? (
              <Text className="mt-0.5 block break-all" size="meta" tone="muted">
                {cloud.server}
              </Text>
            ) : null}
            {detail ? (
              <Text className="mt-0.5 block" size="meta" tone="muted">
                {detail}
              </Text>
            ) : null}
            {cloud.lastSyncAt ? (
              <AppActivityTime timestamp={cloud.lastSyncAt} />
            ) : null}
          </div>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title={t("settings.connectionTitle")}>
        <div className="flex flex-col gap-3 py-3.5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <Text className="block" size="body" weight="medium">
                {t("settings.status.title")}
              </Text>
              <Text className="mt-0.5 block" size="meta" tone="muted">
                {statusText(t, status, installing)}
              </Text>
              {status?.executable ? (
                <Text
                  className="mt-1 block break-all font-mono"
                  size="meta"
                  tone="muted"
                >
                  {status.executable}
                </Text>
              ) : null}
              {status?.dataDir ? (
                <Text
                  className="mt-1 block break-all font-mono"
                  size="meta"
                  tone="muted"
                >
                  {status.dataDir}
                </Text>
              ) : null}
              {status ? <MemoryDoctorDetails status={status} /> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {busy || installing ? <Spinner size="md" /> : null}
              {setupAction ? (
                <Button
                  disabled={busy || installing || unsupported}
                  size="sm"
                  variant="outline"
                  onClick={() => void runInstall()}
                >
                  {setupAction === "repair"
                    ? t("settings.actions.repair")
                    : t("settings.actions.install")}
                </Button>
              ) : null}
              <Button
                disabled={busy || installing || !status?.available}
                size="sm"
                variant="ghost"
                onClick={() => void runDoctor()}
              >
                {t("settings.actions.doctor")}
              </Button>
            </div>
          </div>
        </div>
        <SettingRow
          searchId="memory.cliPath"
          description={t("settings.cliPath.description")}
          title={t("settings.cliPath.title")}
        >
          <Input
            key={settings.cliPath ?? ""}
            aria-label={t("settings.cliPath.title")}
            className="w-80"
            defaultValue={settings.cliPath ?? ""}
            placeholder={t("settings.cliPath.placeholder")}
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next !== settings.cliPath) {
                void save({ ...settings, cliPath: next });
              }
            }}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.linksTitle")}>
        <SettingRow
          description={t("settings.links.site.description")}
          title={t("settings.links.site.title")}
        >
          <Button
            aria-label={t("settings.links.site.action")}
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(RSRS_SITE_URL)}
          >
            <ExternalLink className="size-3.5" />
            {t("settings.links.open")}
          </Button>
        </SettingRow>
        <SettingRow
          description={t("settings.links.repo.description")}
          title={t("settings.links.repo.title")}
        >
          <Button
            aria-label={t("settings.links.repo.action")}
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(RSRS_REPO_URL)}
          >
            <ExternalLink className="size-3.5" />
            {t("settings.links.open")}
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

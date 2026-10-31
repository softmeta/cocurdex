import {
  DEFAULT_MEMORY_CLOUD_STATUS,
  DEFAULT_MEMORY_SETTINGS,
  type MemoryCloudStatus,
  type MemorySettings,
  type MemoryStatus,
  RSRS_REPO_URL,
  RSRS_SITE_URL,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { ExternalLink, KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AppActivityTime,
  AppConfirmDialog,
  SettingRow,
  SettingsGroup,
} from "@/components/app";
import { Button, Input, Spinner, Switch, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { CloudSyncDialog } from "./cloud-sync-dialog";
import {
  revalidateMemory,
  useMemorySettings,
  useMemoryStatus,
} from "./memory-queries";
import { RecoveryKeyDialog } from "./recovery-key-dialog";

function statusText(
  t: TFunction<"memory">,
  status: MemoryStatus | undefined,
  installing: boolean,
) {
  if (status?.supported === false) return t("settings.status.unsupported");
  if (status?.available) {
    return t("settings.status.available", {
      version: status.version ?? t("settings.status.unknown"),
    });
  }
  return installing
    ? t("settings.status.installing")
    : t("settings.status.missing");
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

export function MemorySettingsPanel() {
  const { t } = useTranslation("memory");
  const { data: status } = useMemoryStatus();
  const { data: settingsData } = useMemorySettings();
  const settings = settingsData ?? DEFAULT_MEMORY_SETTINGS;
  const [busy, setBusy] = useState(false);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const [cloudKeys, setCloudKeys] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const installing = status?.installation === "installing";
  const unsupported = status?.supported === false;
  const cloud = status?.cloud ?? DEFAULT_MEMORY_CLOUD_STATUS;
  const syncReady =
    Boolean(status?.available) && settings.enabled && !unsupported;
  const cloudLocked = busy || installing || !syncReady;

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

  const changeSync = async (enabled: boolean) => {
    if (enabled && !cloud.connected) {
      setCloudDialogOpen(true);
      return;
    }
    setBusy(true);
    try {
      await desktopApi.setMemoryCloudSync(enabled);
      await revalidateMemory();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.cloud.toggleFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await desktopApi.disconnectMemoryCloud();
      await revalidateMemory();
      toast.success(t("settings.cloud.signedOut"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.cloud.signOutFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const revealCloudKeys = async () => {
    setBusy(true);
    try {
      const keys = await desktopApi.getMemoryCloudKeys();
      setCloudKeys(keys.content);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("settings.keys.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const cloudDescription = !settings.enabled
    ? t("settings.cloud.needsMemory")
    : !status?.available
      ? t("settings.cloud.needsRsrs")
      : t("settings.cloud.description");
  const detail = cloudDetail(t, cloud);

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title={t("settings.groupTitle")}>
        <SettingRow
          description={t("settings.enabled.description")}
          title={t("settings.enabled.title")}
        >
          <Switch
            aria-label={t("settings.enabled.title")}
            checked={settings.enabled}
            disabled={unsupported}
            onCheckedChange={(enabled) => void save({ ...settings, enabled })}
          />
        </SettingRow>
        <SettingRow
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
        <SettingRow
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
          description={t("settings.chatSaveTurns.description")}
          title={t("settings.chatSaveTurns.title")}
        >
          <Switch
            aria-label={t("settings.chatSaveTurns.title")}
            checked={settings.chat.saveTurns}
            disabled={!settings.enabled}
            onCheckedChange={(saveTurns) =>
              void save({ ...settings, chat: { ...settings.chat, saveTurns } })
            }
          />
        </SettingRow>
        <SettingRow
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

      <SettingsGroup title={t("settings.cloudTitle")}>
        <SettingRow
          description={cloudDescription}
          title={t("settings.cloud.title")}
        >
          <Switch
            aria-label={t("settings.cloud.title")}
            checked={cloud.connected && cloud.autosync}
            disabled={cloudLocked}
            onCheckedChange={(enabled) => void changeSync(enabled)}
          />
        </SettingRow>
        {cloud.connected ? (
          <div className="flex items-center justify-between gap-6 py-3.5">
            <div className="min-w-0 flex-1">
              <Text className="block" size="body" weight="medium">
                {cloud.user}
              </Text>
              <Text className="mt-0.5 block break-all" size="meta" tone="muted">
                {cloud.server}
              </Text>
              {detail ? (
                <Text className="mt-0.5 block" size="meta" tone="muted">
                  {detail}
                </Text>
              ) : null}
              {cloud.lastSyncAt ? (
                <AppActivityTime timestamp={cloud.lastSyncAt} />
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                disabled={cloudLocked}
                size="sm"
                variant="ghost"
                onClick={() => void revealCloudKeys()}
              >
                <KeyRound className="size-3.5" />
                {t("settings.cloud.recoveryKey")}
              </Button>
              <Button
                disabled={cloudLocked}
                size="sm"
                variant="ghost"
                onClick={() => setConfirmSignOut(true)}
              >
                <LogOut className="size-3.5" />
                {t("settings.cloud.signOut")}
              </Button>
            </div>
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
              {status?.doctor ? (
                <Text className="mt-1 block" size="meta" tone="muted">
                  {t("settings.status.doctor", {
                    status: status.doctor.status,
                    pass: status.doctor.summary.pass,
                    warn: status.doctor.summary.warn,
                    fail: status.doctor.summary.fail,
                  })}
                </Text>
              ) : null}
              {status?.error ? (
                <Text
                  className="mt-1 block whitespace-pre-wrap"
                  size="meta"
                  tone="muted"
                >
                  {status.error}
                </Text>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {busy || installing ? <Spinner size="md" /> : null}
              <Button
                disabled={busy || installing || unsupported}
                size="sm"
                variant="outline"
                onClick={() => void runInstall()}
              >
                {status?.available
                  ? t("settings.actions.verify")
                  : t("settings.actions.install")}
              </Button>
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

      {cloudDialogOpen ? (
        <CloudSyncDialog
          initialUser={cloud.user}
          onClose={() => setCloudDialogOpen(false)}
        />
      ) : null}
      {cloudKeys !== null ? (
        <RecoveryKeyDialog
          content={cloudKeys}
          onClose={() => setCloudKeys(null)}
        />
      ) : null}
      <AppConfirmDialog
        cancelLabel={t("settings.cloud.cancel")}
        confirmLabel={t("settings.cloud.signOut")}
        description={t("settings.cloud.signOutDescription")}
        open={confirmSignOut}
        title={t("settings.cloud.signOutTitle")}
        variant="destructive"
        onConfirm={() => void signOut()}
        onOpenChange={setConfirmSignOut}
      />
    </div>
  );
}

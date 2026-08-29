import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Spinner, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import type { CliPathStatus } from "@/lib/types";

export function CliPathSettingsPanel() {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<CliPathStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useMountEffect(() => {
    void desktopApi.getCliPathStatus().then(setStatus);
  });

  const statusText = (() => {
    if (!status) {
      return t("cli.loading");
    }
    if (status.error && !status.available) {
      return status.error;
    }
    if (status.installed && status.pointsToCurrentApp) {
      if (status.binDirOnPath) {
        return t("cli.status.ready", { path: status.installPath });
      }
      return t("cli.status.installedNotOnPath", { path: status.installPath });
    }
    if (status.installed && !status.pointsToCurrentApp) {
      return t("cli.status.foreignInstall", { path: status.installPath });
    }
    return t("cli.status.notInstalled");
  })();

  const refresh = async () => {
    setStatus(await desktopApi.getCliPathStatus());
  };

  const runInstall = async () => {
    setBusy(true);
    try {
      const next = await desktopApi.installCliOnPath();
      setStatus(next);
      if (next.installed && next.pointsToCurrentApp) {
        toast.success(t("cli.toast.installed"));
      } else if (next.error) {
        toast.error(next.error);
      } else {
        toast.error(t("cli.toast.installFailed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("cli.toast.installFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const runUninstall = async () => {
    setBusy(true);
    try {
      const next = await desktopApi.uninstallCliFromPath();
      setStatus(next);
      toast.success(t("cli.toast.uninstalled"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("cli.toast.uninstallFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const canInstall = Boolean(status?.available) && !busy;
  const canUninstall =
    Boolean(status?.installed && status.pointsToCurrentApp) && !busy;

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-foreground">
            {t("cli.title")}
          </div>
          <div className="mt-0.5 text-body text-muted-foreground">
            {t("cli.description")}
          </div>
          <Text className="mt-2 block" size="meta" tone="muted">
            {statusText}
          </Text>
          {status?.pathHint && !status.binDirOnPath ? (
            <Text
              className="mt-2 block whitespace-pre-wrap rounded-control bg-muted/40 px-2 py-1.5 font-mono"
              size="meta"
              tone="muted"
            >
              {status.pathHint}
            </Text>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy ? <Spinner size="md" /> : null}
          <Button
            disabled={!canInstall}
            size="sm"
            variant="outline"
            onClick={() => void runInstall()}
          >
            {status?.installed && status.pointsToCurrentApp
              ? t("cli.actions.reinstall")
              : t("cli.actions.install")}
          </Button>
          <Button
            disabled={!canUninstall}
            size="sm"
            variant="ghost"
            onClick={() => void runUninstall()}
          >
            {t("cli.actions.uninstall")}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
          >
            {t("cli.actions.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}

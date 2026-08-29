import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Spinner, Text } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import type { DaemonRuntimeStatus } from "@/lib/types";

type DaemonStatusKind = "loading" | "running" | "outdated" | "stopped";

function resolveDaemonStatusKind(
  status: DaemonRuntimeStatus | null,
): DaemonStatusKind {
  if (!status) {
    return "loading";
  }
  if (!status.running) {
    return "stopped";
  }
  if (!status.matchesRuntime) {
    return "outdated";
  }
  return "running";
}

function daemonStatusTextClassName(kind: DaemonStatusKind) {
  switch (kind) {
    case "running":
      return "text-chat-status-completed-fg";
    case "outdated":
      return "text-chat-status-pending-fg";
    case "stopped":
      return "text-chat-status-failed-fg";
    default:
      return "text-muted-foreground";
  }
}

function formatStartedAt(startedAt: string | null, locale: string) {
  if (!startedAt) {
    return null;
  }
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return startedAt;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function shortenFingerprint(fingerprint: string | null) {
  if (!fingerprint) {
    return null;
  }
  if (fingerprint.length <= 16) {
    return fingerprint;
  }
  return `${fingerprint.slice(0, 8)}…${fingerprint.slice(-6)}`;
}

export function DaemonSettingsPanel() {
  const { t, i18n } = useTranslation("settings");
  const [status, setStatus] = useState<DaemonRuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useMountEffect(() => {
    void desktopApi.getDaemonStatus().then(setStatus);
  });

  const refresh = async () => {
    setStatus(await desktopApi.getDaemonStatus());
  };

  const runRestart = async () => {
    setBusy(true);
    try {
      const next = await desktopApi.restartDaemon();
      setStatus(next);
      if (next.running && next.matchesRuntime) {
        toast.success(t("daemon.toast.restarted"));
      } else if (next.error) {
        toast.error(next.error);
      } else {
        toast.error(t("daemon.toast.restartFailed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("daemon.toast.restartFailed"),
      );
      try {
        setStatus(await desktopApi.getDaemonStatus());
      } catch {
        // Keep the previous snapshot if a follow-up status probe fails.
      }
    } finally {
      setBusy(false);
    }
  };

  const pidLabel =
    status?.pid === null || status?.pid === undefined
      ? "—"
      : String(status.pid);
  const statusKind = resolveDaemonStatusKind(status);

  const statusText = (() => {
    switch (statusKind) {
      case "loading":
        return t("daemon.loading");
      case "stopped":
        return t("daemon.status.stopped");
      case "outdated":
        return t("daemon.status.outdated", { pid: pidLabel });
      case "running":
        if (status?.ownedByThisApp) {
          return t("daemon.status.runningOwned", { pid: pidLabel });
        }
        return t("daemon.status.running", { pid: pidLabel });
    }
  })();

  const startedAtLabel = formatStartedAt(
    status?.startedAt ?? null,
    i18n.language,
  );
  const fingerprintLabel = shortenFingerprint(
    status?.runtimeFingerprint ?? null,
  );
  const primaryActionLabel = status?.running
    ? t("daemon.actions.restart")
    : t("daemon.actions.start");

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-foreground">
            {t("daemon.title")}
          </div>
          <div className="mt-0.5 text-body text-muted-foreground">
            {t("daemon.description")}
          </div>
          <Text
            className={cn(
              "mt-2 block font-medium",
              daemonStatusTextClassName(statusKind),
            )}
            size="meta"
          >
            {statusText}
          </Text>
          {status?.running ? (
            <div className="mt-2 flex flex-col gap-1">
              {status.socketPath ? (
                <Text
                  className="block break-all font-mono"
                  size="meta"
                  tone="muted"
                >
                  {t("daemon.details.socket", { path: status.socketPath })}
                </Text>
              ) : null}
              {startedAtLabel ? (
                <Text className="block" size="meta" tone="muted">
                  {t("daemon.details.startedAt", { value: startedAtLabel })}
                </Text>
              ) : null}
              {status.protocolVersion !== null ? (
                <Text className="block" size="meta" tone="muted">
                  {t("daemon.details.protocol", {
                    version: String(status.protocolVersion),
                  })}
                </Text>
              ) : null}
              {fingerprintLabel ? (
                <Text className="block font-mono" size="meta" tone="muted">
                  {t("daemon.details.runtime", {
                    fingerprint: fingerprintLabel,
                  })}
                </Text>
              ) : null}
            </div>
          ) : null}
          {status && !status.running && status.error ? (
            <Text
              className="mt-2 block whitespace-pre-wrap rounded-control bg-muted/40 px-2 py-1.5 font-mono"
              size="meta"
              tone="muted"
            >
              {status.error}
            </Text>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy ? <Spinner size="md" /> : null}
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => void runRestart()}
          >
            {primaryActionLabel}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
          >
            {t("daemon.actions.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}

import type { RemoteHostRecord, RemoteHostStatus } from "@cocurdex/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog, SettingsGroup } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { desktopApi, requestDaemon } from "@/lib";
import { ListRow } from "./device-lists";
import { RemoteHostPairDialog } from "./remote-host-pair-dialog";
import { useRemoteHosts } from "./remote-hosts-queries";

function useStatusLabels(): Record<RemoteHostStatus, string> {
  const { t } = useTranslation("settings");
  return {
    unknown: t("devices.remotes.status.unknown"),
    connected: t("devices.remotes.status.connected"),
    pending: t("devices.remotes.status.pending"),
    offline: t("devices.remotes.status.offline"),
    rejected: t("devices.remotes.status.rejected"),
  };
}

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}

export function RemoteHostsGroup() {
  const { t } = useTranslation("settings");
  const statusLabels = useStatusLabels();
  const { data: hosts, mutate } = useRemoteHosts();
  const [pairing, setPairing] = useState(false);
  const [removing, setRemoving] = useState<RemoteHostRecord | null>(null);
  const canOpenWindows = desktopApi.capabilities.remoteHostWindows;

  if (!hosts) return null;

  const open = (host: RemoteHostRecord) =>
    void desktopApi
      .openRemoteHostWindow({ hostId: host.hostId })
      .catch((error: unknown) =>
        reportError(error, t("devices.remotes.openFailed")),
      );

  const remove = (host: RemoteHostRecord) =>
    void requestDaemon("host.remotes.remove", { hostId: host.hostId })
      .then(() => mutate())
      .catch((error: unknown) =>
        reportError(error, t("devices.remotes.removeFailed")),
      );

  return (
    <SettingsGroup
      action={
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setPairing(true)}
        >
          <Plus className="size-3.5" />
          {t("devices.remotes.pairOpen")}
        </Button>
      }
      description={t("devices.remotes.description")}
      searchId="devices.remoteHosts"
      title={t("devices.remotes.groupTitle")}
    >
      {hosts.length === 0 ? (
        <div className="py-3.5">
          <Text size="body" tone="muted">
            {t("devices.remotes.empty")}
          </Text>
        </div>
      ) : null}
      {hosts.map((host) => (
        <ListRow
          action={
            <div className="flex items-center gap-1">
              {canOpenWindows && host.status !== "rejected" ? (
                <Button
                  aria-label={t("devices.remotes.openLabel", {
                    name: host.name,
                  })}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => open(host)}
                >
                  {t("devices.remotes.open")}
                </Button>
              ) : null}
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setRemoving(host)}
              >
                {t("devices.remotes.remove")}
              </Button>
            </div>
          }
          detail={t("devices.remotes.detail", {
            status: statusLabels[host.status],
            code: host.safetyCode,
          })}
          deviceId={host.hostId}
          key={host.hostId}
          title={host.name}
        />
      ))}
      {pairing ? (
        <RemoteHostPairDialog
          onClose={() => setPairing(false)}
          onPaired={() => void mutate()}
        />
      ) : null}
      <AppConfirmDialog
        cancelLabel={t("devices.list.revokeCancel")}
        confirmLabel={t("devices.remotes.remove")}
        description={t("devices.remotes.removeDescription")}
        open={removing !== null}
        title={t("devices.remotes.removeTitle", { name: removing?.name ?? "" })}
        variant="destructive"
        onConfirm={() => {
          const host = removing;
          setRemoving(null);
          if (host) remove(host);
        }}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
      />
    </SettingsGroup>
  );
}

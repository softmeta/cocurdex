import type {
  HostAccessAuditEntry,
  HostPairingRecord,
  PairedDeviceRecord,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog, SettingsGroup } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { DeviceAccessDialog } from "./device-access-dialog";
import {
  useAuditActionLabels,
  useFormatDateTime,
  useScopeLabels,
} from "./host-access-labels";

function ListRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0 flex-1">
        <Text className="block font-medium" size="body" truncate>
          {title}
        </Text>
        <Text className="block" size="meta" tone="muted" truncate>
          {detail}
        </Text>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}

export function PendingPairingsGroup({
  pairings,
  onChanged,
}: {
  pairings: HostPairingRecord[];
  onChanged(): void;
}) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  if (pairings.length === 0) return null;
  return (
    <SettingsGroup title={t("devices.pairings.groupTitle")}>
      {pairings.map((pairing) => (
        <ListRow
          action={
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                void desktopApi
                  .cancelHostPairing(pairing.id)
                  .then(onChanged)
                  .catch((error: unknown) =>
                    reportError(error, t("devices.pairings.cancelFailed")),
                  )
              }
            >
              {t("devices.pairings.cancel")}
            </Button>
          }
          detail={t("devices.pairings.expires", {
            time: formatDateTime(pairing.expiresAt),
          })}
          key={pairing.id}
          title={pairing.label}
        />
      ))}
    </SettingsGroup>
  );
}

export function PairedDevicesGroup({
  devices,
  action,
  onChanged,
}: {
  devices: PairedDeviceRecord[];
  action: React.ReactNode;
  onChanged(): void;
}) {
  const { t } = useTranslation("settings");
  const scopeLabels = useScopeLabels();
  const formatDateTime = useFormatDateTime();
  const [revoking, setRevoking] = useState<PairedDeviceRecord | null>(null);
  const [editing, setEditing] = useState<PairedDeviceRecord | null>(null);

  const describe = (device: PairedDeviceRecord) => {
    const scopes = device.scopes
      .map((scope) => scopeLabels[scope].title)
      .join(", ");
    if (device.revokedAt) {
      return t("devices.list.revokedDetail", {
        time: formatDateTime(device.revokedAt),
      });
    }
    return t("devices.list.detail", {
      scopes,
      time: formatDateTime(device.lastSeenAt),
    });
  };

  return (
    <SettingsGroup action={action} title={t("devices.list.groupTitle")}>
      {devices.length === 0 ? (
        <div className="py-3.5">
          <Text size="body" tone="muted">
            {t("devices.list.empty")}
          </Text>
        </div>
      ) : null}
      {devices.map((device) => (
        <ListRow
          action={
            device.revokedAt ? null : (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(device)}
                >
                  {t("devices.list.editAccess")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setRevoking(device)}
                >
                  {t("devices.list.revoke")}
                </Button>
              </div>
            )
          }
          detail={describe(device)}
          key={device.id}
          title={device.label || t("devices.list.unnamed")}
        />
      ))}
      {editing ? (
        <DeviceAccessDialog
          device={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      ) : null}
      <AppConfirmDialog
        cancelLabel={t("devices.list.revokeCancel")}
        confirmLabel={t("devices.list.revoke")}
        description={t("devices.list.revokeDescription")}
        open={revoking !== null}
        title={t("devices.list.revokeTitle", {
          name: revoking?.label || t("devices.list.unnamed"),
        })}
        variant="destructive"
        onConfirm={() => {
          const device = revoking;
          setRevoking(null);
          if (!device) return;
          void desktopApi
            .revokeHostDevice(device.id)
            .then(onChanged)
            .catch((error: unknown) =>
              reportError(error, t("devices.list.revokeFailed")),
            );
        }}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      />
    </SettingsGroup>
  );
}

export function AccessLogGroup({
  entries,
}: {
  entries: HostAccessAuditEntry[];
}) {
  const { t } = useTranslation("settings");
  const actionLabels = useAuditActionLabels();
  const formatDateTime = useFormatDateTime();
  if (entries.length === 0) return null;
  return (
    <SettingsGroup title={t("devices.audit.groupTitle")}>
      {entries.map((entry) => (
        <ListRow
          detail={[formatDateTime(entry.at), entry.actor, entry.remoteAddress]
            .filter(Boolean)
            .join(" · ")}
          key={entry.id}
          title={actionLabels[entry.action] ?? entry.action}
        />
      ))}
    </SettingsGroup>
  );
}

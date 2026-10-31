import type { HostAccessAuditAction, HostAccessScope } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export interface ScopeLabel {
  title: string;
  description: string;
}

export function useScopeLabels(): Record<HostAccessScope, ScopeLabel> {
  const { t } = useTranslation("settings");
  return {
    read: {
      title: t("devices.scope.read.title"),
      description: t("devices.scope.read.description"),
    },
    interact: {
      title: t("devices.scope.interact.title"),
      description: t("devices.scope.interact.description"),
    },
    execute: {
      title: t("devices.scope.execute.title"),
      description: t("devices.scope.execute.description"),
    },
    "files.read": {
      title: t("devices.scope.filesRead.title"),
      description: t("devices.scope.filesRead.description"),
    },
    "files.write": {
      title: t("devices.scope.filesWrite.title"),
      description: t("devices.scope.filesWrite.description"),
    },
    "git.destructive": {
      title: t("devices.scope.gitDestructive.title"),
      description: t("devices.scope.gitDestructive.description"),
    },
    approvals: {
      title: t("devices.scope.approvals.title"),
      description: t("devices.scope.approvals.description"),
    },
    credentials: {
      title: t("devices.scope.credentials.title"),
      description: t("devices.scope.credentials.description"),
    },
    "host.admin": {
      title: t("devices.scope.hostAdmin.title"),
      description: t("devices.scope.hostAdmin.description"),
    },
  };
}

export function useAuditActionLabels(): Record<HostAccessAuditAction, string> {
  const { t } = useTranslation("settings");
  return {
    "pairing.created": t("devices.audit.action.pairingCreated"),
    "pairing.cancelled": t("devices.audit.action.pairingCancelled"),
    "pairing.exchanged": t("devices.audit.action.pairingExchanged"),
    "pairing.rejected": t("devices.audit.action.pairingRejected"),
    "device.revoked": t("devices.audit.action.deviceRevoked"),
    "device.scopesChanged": t("devices.audit.action.deviceScopesChanged"),
    "remote.enabled": t("devices.audit.action.remoteEnabled"),
    "remote.disabled": t("devices.audit.action.remoteDisabled"),
    "relay.changed": t("devices.audit.action.relayChanged"),
  };
}

export function useFormatDateTime() {
  const { i18n } = useTranslation();
  return (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };
}

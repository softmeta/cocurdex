import type {
  HostAccessAuditEntry,
  HostPairingRecord,
  HostRemoteAccessStatus,
  PairedDevice,
} from "@cocurdex/shared";
import { useCallback, useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

const AUDIT_LIMIT = 20;

export interface HostAccessSnapshot {
  remote: HostRemoteAccessStatus;
  pairings: HostPairingRecord[];
  devices: PairedDevice[];
  audit: HostAccessAuditEntry[];
}

export function useHostAccess() {
  const [snapshot, setSnapshot] = useState<HostAccessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [remote, pairings, devices, audit] = await Promise.all([
        desktopApi.getHostRemoteAccess(),
        desktopApi.listHostPairings(),
        desktopApi.listHostDevices(),
        desktopApi.listHostAudit(AUDIT_LIMIT),
      ]);
      setSnapshot({ remote, pairings, devices, audit });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useMountEffect(() => {
    void refresh();
  });

  return { snapshot, error, refresh };
}

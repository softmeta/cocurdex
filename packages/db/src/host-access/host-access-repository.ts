import type {
  HostAccessAuditEntry,
  HostAccessScope,
  HostPairingRecord,
  PairedDeviceRecord,
} from "@cocurdex/shared";

export interface NewHostDevice {
  id: string;
  label: string;
  tokenHash: string;
  createdAt: string;
}

export type HostPairingConsumeResult =
  | { ok: true; pairing: HostPairingRecord; device: PairedDeviceRecord }
  | { ok: false; reason: "unknown" | "expired" | "consumed" };

export interface HostAccessRepository {
  insertPairing(pairing: HostPairingRecord, codeHash: string): void;
  consumePairing(
    codeHash: string,
    now: string,
    device: NewHostDevice,
  ): HostPairingConsumeResult;
  listPendingPairings(now: string): HostPairingRecord[];
  deletePendingPairing(pairingId: string): HostPairingRecord | null;
  findActiveDeviceByTokenHash(tokenHash: string): PairedDeviceRecord | null;
  listDevices(): PairedDeviceRecord[];
  revokeDevice(deviceId: string, now: string): PairedDeviceRecord | null;
  updateDeviceScopes(
    deviceId: string,
    scopes: HostAccessScope[],
  ): PairedDeviceRecord | null;
  touchDevice(deviceId: string, now: string): void;
  appendAudit(entry: HostAccessAuditEntry): void;
  listAudit(limit: number): HostAccessAuditEntry[];
}

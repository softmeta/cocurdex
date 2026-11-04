import type {
  HostAccessAuditEntry,
  HostAccessScope,
  HostPairingRecord,
  PairedDeviceRecord,
  PushPlatform,
} from "@cocurdex/shared";

export interface NewHostDevice {
  id: string;
  label: string;
  publicKey: string;
  createdAt: string;
}

export type HostPairingConsumeResult =
  | { ok: true; pairing: HostPairingRecord; device: PairedDeviceRecord }
  | { ok: false; reason: "unknown" | "expired" | "consumed" };

export interface DevicePush {
  platform: PushPlatform;
  handle: string;
}

export interface PushTarget extends DevicePush {
  deviceId: string;
  publicKey: string;
  scopes: HostAccessScope[];
}

export interface HostAccessRepository {
  insertPairing(pairing: HostPairingRecord, codeHash: string): void;
  consumePairing(
    codeHash: string,
    now: string,
    device: NewHostDevice,
  ): HostPairingConsumeResult;
  listPendingPairings(now: string): HostPairingRecord[];
  deletePendingPairing(pairingId: string): HostPairingRecord | null;
  findActiveDeviceByPublicKey(publicKey: string): PairedDeviceRecord | null;
  listDevices(): PairedDeviceRecord[];
  approveDevice(
    deviceId: string,
    now: string,
    pendingSince: string,
  ): PairedDeviceRecord | null;
  revokeDevice(deviceId: string, now: string): PairedDeviceRecord | null;
  updateDeviceScopes(
    deviceId: string,
    scopes: HostAccessScope[],
  ): PairedDeviceRecord | null;
  touchDevice(deviceId: string, now: string): void;
  setDevicePush(
    deviceId: string,
    push: DevicePush | null,
    now: string,
  ): boolean;
  clearDevicePushHandle(handle: string, now: string): void;
  listPushTargets(): PushTarget[];
  appendAudit(entry: HostAccessAuditEntry): void;
  listAudit(limit: number): HostAccessAuditEntry[];
}

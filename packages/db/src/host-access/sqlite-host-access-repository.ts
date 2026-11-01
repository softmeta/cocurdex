import type { DatabaseSync } from "node:sqlite";
import {
  type HostAccessAuditEntry,
  type HostAccessScope,
  type HostPairingRecord,
  isHostAccessScope,
  type PairedDeviceRecord,
  PUSH_PLATFORMS,
  type PushPlatform,
} from "@cocurdex/shared";
import type {
  HostAccessRepository,
  HostPairingConsumeResult,
} from "./host-access-repository";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseScopes(value: unknown): HostAccessScope[] {
  try {
    const parsed = JSON.parse(text(value)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (scope): scope is HostAccessScope =>
            typeof scope === "string" && isHostAccessScope(scope),
        )
      : [];
  } catch {
    return [];
  }
}

function pushPlatform(value: unknown): PushPlatform | null {
  return PUSH_PLATFORMS.find((platform) => platform === value) ?? null;
}

function toDevice(row: Row): PairedDeviceRecord {
  return {
    id: text(row.id),
    label: text(row.label),
    scopes: parseScopes(row.scopes_json),
    createdAt: text(row.created_at),
    lastSeenAt: nullableText(row.last_seen_at),
    revokedAt: nullableText(row.revoked_at),
    publicKey: nullableText(row.public_key),
    pushPlatform: row.push_handle ? pushPlatform(row.push_platform) : null,
  };
}

function toPairing(row: Row): HostPairingRecord {
  return {
    id: text(row.id),
    label: text(row.label),
    scopes: parseScopes(row.scopes_json),
    createdAt: text(row.created_at),
    expiresAt: text(row.expires_at),
    consumedAt: nullableText(row.consumed_at),
    deviceId: nullableText(row.device_id),
  };
}

function toAudit(row: Row): HostAccessAuditEntry {
  return {
    id: text(row.id),
    at: text(row.at),
    action: text(row.action) as HostAccessAuditEntry["action"],
    actor: text(row.actor),
    subject: nullableText(row.subject),
    remoteAddress: nullableText(row.remote_address),
  };
}

export function createSqliteHostAccessRepository(
  database: DatabaseSync,
): HostAccessRepository {
  const getDevice = (deviceId: string) => {
    const row = database
      .prepare("SELECT * FROM host_devices WHERE id = ?")
      .get(deviceId) as Row | undefined;
    return row ? toDevice(row) : null;
  };

  const consume = (
    codeHash: string,
    now: string,
    device: Parameters<HostAccessRepository["consumePairing"]>[2],
  ): HostPairingConsumeResult => {
    const row = database
      .prepare("SELECT * FROM host_pairings WHERE code_hash = ?")
      .get(codeHash) as Row | undefined;
    if (!row) return { ok: false, reason: "unknown" };
    const pairing = toPairing(row);
    if (pairing.consumedAt) return { ok: false, reason: "consumed" };
    if (pairing.expiresAt <= now) return { ok: false, reason: "expired" };
    database
      .prepare(
        `INSERT INTO host_devices
           (id, label, token_hash, public_key, scopes_json, created_at,
            last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        device.id,
        device.label,
        `public-key:${device.publicKey}`,
        device.publicKey,
        JSON.stringify(pairing.scopes),
        device.createdAt,
        device.createdAt,
      );
    database
      .prepare(
        "UPDATE host_pairings SET consumed_at = ?, device_id = ? WHERE id = ?",
      )
      .run(now, device.id, pairing.id);
    const created = getDevice(device.id);
    if (!created) throw new Error("Paired device was not stored");
    return {
      ok: true,
      pairing: { ...pairing, consumedAt: now, deviceId: device.id },
      device: created,
    };
  };

  return {
    insertPairing(pairing, codeHash) {
      database
        .prepare(
          `INSERT INTO host_pairings
             (id, label, code_hash, scopes_json, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          pairing.id,
          pairing.label,
          codeHash,
          JSON.stringify(pairing.scopes),
          pairing.createdAt,
          pairing.expiresAt,
        );
    },
    consumePairing(codeHash, now, device) {
      database.exec("SAVEPOINT host_pairing_consume");
      try {
        const result = consume(codeHash, now, device);
        database.exec("RELEASE host_pairing_consume");
        return result;
      } catch (error) {
        database.exec("ROLLBACK TO host_pairing_consume");
        database.exec("RELEASE host_pairing_consume");
        throw error;
      }
    },
    listPendingPairings(now) {
      return (
        database
          .prepare(
            `SELECT * FROM host_pairings
             WHERE consumed_at IS NULL AND expires_at > ?
             ORDER BY created_at DESC`,
          )
          .all(now) as Row[]
      ).map(toPairing);
    },
    deletePendingPairing(pairingId) {
      const row = database
        .prepare(
          "SELECT * FROM host_pairings WHERE id = ? AND consumed_at IS NULL",
        )
        .get(pairingId) as Row | undefined;
      if (!row) return null;
      database.prepare("DELETE FROM host_pairings WHERE id = ?").run(pairingId);
      return toPairing(row);
    },
    findActiveDeviceByPublicKey(publicKey) {
      const row = database
        .prepare(
          "SELECT * FROM host_devices WHERE public_key = ? AND revoked_at IS NULL",
        )
        .get(publicKey) as Row | undefined;
      return row ? toDevice(row) : null;
    },
    listDevices() {
      return (
        database
          .prepare("SELECT * FROM host_devices ORDER BY created_at DESC")
          .all() as Row[]
      ).map(toDevice);
    },
    revokeDevice(deviceId, now) {
      database
        .prepare(
          `UPDATE host_devices
           SET revoked_at = ?, push_platform = NULL, push_handle = NULL,
               push_updated_at = ?
           WHERE id = ? AND revoked_at IS NULL`,
        )
        .run(now, now, deviceId);
      return getDevice(deviceId);
    },
    setDevicePush(deviceId, push, now) {
      const { changes } = database
        .prepare(
          `UPDATE host_devices
           SET push_platform = ?, push_handle = ?, push_updated_at = ?
           WHERE id = ? AND revoked_at IS NULL`,
        )
        .run(push?.platform ?? null, push?.handle ?? null, now, deviceId);
      return Number(changes) > 0;
    },
    clearDevicePushHandle(handle, now) {
      database
        .prepare(
          `UPDATE host_devices
           SET push_platform = NULL, push_handle = NULL, push_updated_at = ?
           WHERE push_handle = ?`,
        )
        .run(now, handle);
    },
    listPushTargets() {
      return (
        database
          .prepare(
            `SELECT * FROM host_devices
             WHERE revoked_at IS NULL AND push_handle IS NOT NULL
               AND public_key IS NOT NULL`,
          )
          .all() as Row[]
      ).flatMap((row) => {
        const device = toDevice(row);
        const platform = pushPlatform(row.push_platform);
        if (!platform || !device.publicKey) return [];
        return [
          {
            deviceId: device.id,
            publicKey: device.publicKey,
            scopes: device.scopes,
            platform,
            handle: text(row.push_handle),
          },
        ];
      });
    },
    updateDeviceScopes(deviceId, scopes) {
      const { changes } = database
        .prepare(
          "UPDATE host_devices SET scopes_json = ? WHERE id = ? AND revoked_at IS NULL",
        )
        .run(JSON.stringify(scopes), deviceId);
      return changes > 0 ? getDevice(deviceId) : null;
    },
    touchDevice(deviceId, now) {
      database
        .prepare("UPDATE host_devices SET last_seen_at = ? WHERE id = ?")
        .run(now, deviceId);
    },
    appendAudit(entry) {
      database
        .prepare(
          `INSERT INTO host_access_audit
             (id, at, action, actor, subject, remote_address)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          entry.at,
          entry.action,
          entry.actor,
          entry.subject,
          entry.remoteAddress,
        );
    },
    listAudit(limit) {
      return (
        database
          .prepare(
            "SELECT * FROM host_access_audit ORDER BY at DESC, rowid DESC LIMIT ?",
          )
          .all(limit) as Row[]
      ).map(toAudit);
    },
  };
}

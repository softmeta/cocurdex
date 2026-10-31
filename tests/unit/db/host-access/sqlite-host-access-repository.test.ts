import { DatabaseSync } from "node:sqlite";
import { createSqliteHostAccessRepository } from "@cocurdex/db/internal/host-access/sqlite-host-access-repository";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";
import { describe, expect, it } from "vitest";

const created = "2026-10-11T00:00:00.000Z";
const later = "2026-10-11T00:05:00.000Z";
const expired = "2026-10-11T01:00:00.000Z";

function setup() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const repository = createSqliteHostAccessRepository(database);
  repository.insertPairing(
    {
      id: "p1",
      label: "Phone",
      scopes: ["read", "approvals"],
      createdAt: created,
      expiresAt: "2026-10-11T00:10:00.000Z",
      consumedAt: null,
      deviceId: null,
    },
    "code-hash",
  );
  return repository;
}

const device = { id: "d1", label: "Pixel", tokenHash: "tok", createdAt: later };

describe("sqlite host access repository", () => {
  it("turns a pending pairing into a device with the pairing's scopes exactly once", () => {
    const repository = setup();

    const first = repository.consumePairing("code-hash", later, device);
    const second = repository.consumePairing("code-hash", later, {
      ...device,
      id: "d2",
      tokenHash: "tok2",
    });

    expect(first).toMatchObject({
      ok: true,
      device: { id: "d1", scopes: ["read", "approvals"] },
      pairing: { consumedAt: later, deviceId: "d1" },
    });
    expect(second).toEqual({ ok: false, reason: "consumed" });
    expect(repository.listDevices().map((item) => item.id)).toEqual(["d1"]);
    expect(repository.listPendingPairings(later)).toEqual([]);
  });

  it("rejects unknown and expired codes without creating devices", () => {
    const repository = setup();

    expect(repository.consumePairing("other", later, device)).toEqual({
      ok: false,
      reason: "unknown",
    });
    expect(repository.consumePairing("code-hash", expired, device)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(repository.listDevices()).toEqual([]);
  });

  it("stops resolving a device token once the device is revoked", () => {
    const repository = setup();
    repository.consumePairing("code-hash", later, device);

    expect(repository.findActiveDeviceByTokenHash("tok")?.id).toBe("d1");
    expect(repository.revokeDevice("d1", expired)?.revokedAt).toBe(expired);
    expect(repository.findActiveDeviceByTokenHash("tok")).toBeNull();
  });

  it("changes the scopes of an active device but not of a revoked one", () => {
    const repository = setup();
    repository.consumePairing("code-hash", later, device);

    expect(
      repository.updateDeviceScopes("d1", ["read", "files.read"])?.scopes,
    ).toEqual(["read", "files.read"]);
    expect(repository.findActiveDeviceByTokenHash("tok")?.scopes).toEqual([
      "read",
      "files.read",
    ]);
    repository.revokeDevice("d1", expired);
    expect(repository.updateDeviceScopes("d1", ["read"])).toBeNull();
    expect(repository.listDevices()[0]?.scopes).toEqual(["read", "files.read"]);
  });

  it("cancels only pending pairings", () => {
    const repository = setup();

    expect(repository.deletePendingPairing("p1")?.id).toBe("p1");
    expect(repository.deletePendingPairing("p1")).toBeNull();
  });
});

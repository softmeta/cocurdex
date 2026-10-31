import { HostAccessService } from "@cocurdex/daemon/internal/host-access/host-access-service";
import { createCocurdexDatabase } from "@cocurdex/db";
import { describe, expect, it } from "vitest";

const local = { kind: "local" } as const;
const HOST_KEY = "h".repeat(43);
const KEY_A = "a".repeat(43);
const KEY_B = "b".repeat(43);

async function setup(options: { remoteAccessAllowed?: boolean } = {}) {
  const settings = new Map<string, string>();
  let now = new Date("2026-10-11T00:00:00.000Z");
  const service = new HostAccessService({
    localToken: "local-secret",
    repository: createCocurdexDatabase(":memory:").hostAccess,
    settings: {
      get: async (key) => settings.get(key) ?? null,
      set: async (key, value) => {
        settings.set(key, value);
      },
    },
    hostName: () => "studio",
    hostKey: () => HOST_KEY,
    now: () => now,
    ...options,
  });
  await service.initialize();
  return {
    service,
    settings,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("HostAccessService", () => {
  it("keeps a stable host id across restarts", async () => {
    const { service, settings } = await setup();
    const again = new HostAccessService({
      localToken: "x",
      repository: createCocurdexDatabase(":memory:").hostAccess,
      settings: {
        get: async (key) => settings.get(key) ?? null,
        set: async () => {
          throw new Error("must not rewrite the host id");
        },
      },
      hostName: () => "studio",
      hostKey: () => HOST_KEY,
    });
    await again.initialize();

    expect(again.identity().hostId).toBe(service.identity().hostId);
  });

  it("resolves the local token to a full-access principal and rejects others", async () => {
    const { service } = await setup();

    expect(service.resolve("local-secret")).toEqual({ kind: "local" });
    expect(service.resolve("local-secreT")).toBeNull();
    expect(service.resolveDevice("unknown")).toBeNull();
    expect(service.resolve(undefined)).toBeNull();
  });

  it("pairs a device key once with the pairing's scopes", async () => {
    const { service } = await setup();
    const { code, hostKey } = service.createPairing(
      { label: "Phone", scopes: ["read", "approvals"] },
      local,
    );

    const first = service.pairDevice(
      { secret: code, label: "Pixel" },
      KEY_A,
      "10.0.0.2",
    );
    const second = service.pairDevice({ secret: code }, KEY_B, "10.0.0.2");

    expect(hostKey).toBe(HOST_KEY);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "consumed" });
    if (!first.ok) return;
    expect(first.result.scopes).toEqual(["read", "approvals"]);
    expect(service.resolveDevice(first.result.deviceId)).toEqual({
      kind: "device",
      deviceId: first.result.deviceId,
      scopes: ["read", "approvals"],
    });
    expect(service.listDevices()[0]).toMatchObject({
      label: "Pixel",
      publicKey: KEY_A,
      safetyCode: expect.stringMatching(/^\d{6}$/),
    });
    expect(service.listAudit(10).map((entry) => entry.action)).toEqual([
      "pairing.rejected",
      "pairing.exchanged",
      "pairing.created",
    ]);
  });

  it("connects a paired device only with the key it paired with", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const paired = service.pairDevice({ secret: code }, KEY_A, null);
    if (!paired.ok) throw new Error("pairing failed");
    const { deviceId } = paired.result;

    expect(service.connectDevice({ deviceId }, KEY_B)).toBeNull();
    expect(service.connectDevice({ deviceId: "other" }, KEY_A)).toBeNull();
    expect(service.connectDevice({}, KEY_A)).toBeNull();
    expect(service.connectDevice({ deviceId }, KEY_A)).toMatchObject({
      deviceId,
      scopes: ["read"],
    });
  });

  it("rejects an expired pairing code", async () => {
    const { service, advance } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"], ttlMinutes: 1 },
      local,
    );
    advance(61_000);

    expect(service.pairDevice({ secret: code }, "key", null)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses to grant host administration or an empty scope set through pairing", async () => {
    const { service } = await setup();

    expect(() =>
      service.createPairing({ label: "x", scopes: ["host.admin"] }, local),
    ).toThrow(/host\.admin/);
    expect(() =>
      service.createPairing({ label: "x", scopes: [] }, local),
    ).toThrow();
    expect(() =>
      service.createPairing(
        { label: "x", scopes: ["read"], ttlMinutes: 61 },
        local,
      ),
    ).toThrow();
  });

  it("stops resolving a revoked device and notifies listeners", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const exchanged = service.pairDevice({ secret: code }, "key", null);
    if (!exchanged.ok) throw new Error("pairing failed");
    const revoked: string[] = [];
    service.onDeviceAccessChanged((deviceId) => revoked.push(deviceId));
    expect(service.resolveDevice(exchanged.result.deviceId)).not.toBeNull();

    service.revokeDevice(exchanged.result.deviceId, local);

    expect(service.resolveDevice(exchanged.result.deviceId)).toBeNull();
    expect(
      service.connectDevice({ deviceId: exchanged.result.deviceId }, "key"),
    ).toBeNull();
    expect(revoked).toEqual([exchanged.result.deviceId]);
  });

  it("drops a device whose scopes changed until it reconnects with them", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Tablet", scopes: ["read"] },
      local,
    );
    const exchanged = service.pairDevice({ secret: code }, "key", null);
    if (!exchanged.ok) throw new Error("pairing failed");
    const changed: string[] = [];
    service.onDeviceAccessChanged((deviceId) => changed.push(deviceId));
    expect(service.resolveDevice(exchanged.result.deviceId)).toMatchObject({
      scopes: ["read"],
    });

    const updated = service.updateDeviceScopes(
      exchanged.result.deviceId,
      ["read", "files.read", "read"],
      local,
    );

    expect(updated?.scopes).toEqual(["read", "files.read"]);
    expect(service.resolveDevice(exchanged.result.deviceId)).toBeNull();
    expect(
      service.connectDevice({ deviceId: exchanged.result.deviceId }, "key"),
    ).toMatchObject({ scopes: ["read", "files.read"] });
    expect(service.resolveDevice(exchanged.result.deviceId)).toMatchObject({
      scopes: ["read", "files.read"],
    });
    expect(changed).toEqual([exchanged.result.deviceId]);
    expect(service.listAudit(1)[0]).toMatchObject({
      action: "device.scopesChanged",
      subject: exchanged.result.deviceId,
    });
  });

  it("refuses to grant host administration or an empty scope set to a device", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Tablet", scopes: ["read"] },
      local,
    );
    const exchanged = service.pairDevice({ secret: code }, "key", null);
    if (!exchanged.ok) throw new Error("pairing failed");

    expect(() =>
      service.updateDeviceScopes(
        exchanged.result.deviceId,
        ["read", "host.admin"],
        local,
      ),
    ).toThrow();
    expect(() =>
      service.updateDeviceScopes(exchanged.result.deviceId, [], local),
    ).toThrow();
    expect(service.resolveDevice(exchanged.result.deviceId)).toMatchObject({
      scopes: ["read"],
    });
  });

  it("defaults remote access to off and audits only enable/disable transitions", async () => {
    const { service } = await setup();

    expect(await service.readRemoteAccessSettings()).toEqual({
      enabled: false,
      port: 47_820,
      keepAwake: false,
    });
    await service.saveRemoteAccessSettings(
      { enabled: true, port: 50_000 },
      local,
    );
    await service.saveRemoteAccessSettings(
      { enabled: true, port: 50_001, keepAwake: true },
      local,
    );
    await service.saveRemoteAccessSettings(
      { enabled: true, port: 50_001 },
      local,
    );
    await expect(
      service.saveRemoteAccessSettings({ enabled: true, port: 80 }, local),
    ).rejects.toThrow();

    expect(await service.readRemoteAccessSettings()).toEqual({
      enabled: true,
      port: 50_001,
      keepAwake: true,
    });
    expect(service.listAudit(10).map((entry) => entry.action)).toEqual([
      "remote.enabled",
    ]);
  });

  it("never listens, enables remote access, or pairs when the build disables it", async () => {
    const { service, settings } = await setup({ remoteAccessAllowed: false });
    settings.set(
      "host.remoteAccess",
      JSON.stringify({ enabled: true, port: 50_000 }),
    );
    const applied: unknown[] = [];
    service.bindRemoteListener({
      apply: async (next) => {
        applied.push(next);
        return { listening: true, error: null };
      },
      state: () => ({ listening: false, error: null }),
    });

    await service.startRemoteListener();
    await expect(
      service.setRemoteAccess({ enabled: true, port: 50_000 }, local),
    ).rejects.toThrow("Remote access is disabled in this build");
    expect(() =>
      service.createPairing({ label: "Phone", scopes: ["read"] }, local),
    ).toThrow("Remote access is disabled in this build");

    expect(applied).toEqual([]);
    expect(service.listPairings()).toEqual([]);
    expect(service.listAudit(10)).toEqual([]);
    expect(await service.remoteAccessStatus()).toEqual({
      allowed: false,
      settings: { enabled: false, port: 50_000, keepAwake: false },
      listening: false,
      addresses: [],
      error: null,
    });
  });
});

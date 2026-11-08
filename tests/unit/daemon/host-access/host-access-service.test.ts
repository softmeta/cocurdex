import { HostAccessService } from "@cocurdex/daemon/internal/host-access/host-access-service";
import { relayRouteId } from "@cocurdex/daemon/internal/host-access/relay-connector";
import { createCocurdexDatabase } from "@cocurdex/db";
import { decodeBase64Url, pairingSafetyCode } from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

const local = { kind: "local" } as const;
const HOST_KEY = "h".repeat(43);
const KEY_A = "a".repeat(43);
const KEY_B = "b".repeat(43);

function codeFor(deviceKey: string) {
  return pairingSafetyCode(
    decodeBase64Url(HOST_KEY),
    decodeBase64Url(deviceKey),
  );
}

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
    expect(service.resolveDevice(first.result.deviceId)).toBeNull();
    service.approveDevice(first.result.deviceId, codeFor(KEY_A), local);
    service.connectDevice({ deviceId: first.result.deviceId }, KEY_A);
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
      "device.approved",
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
    service.approveDevice(deviceId, codeFor(KEY_A), local);
    const rejected = { ok: false, reason: "rejected" };

    expect(service.connectDevice({ deviceId }, KEY_B)).toEqual(rejected);
    expect(service.connectDevice({ deviceId: "other" }, KEY_A)).toEqual(
      rejected,
    );
    expect(service.connectDevice({}, KEY_A)).toEqual(rejected);
    expect(service.connectDevice({ deviceId }, KEY_A)).toMatchObject({
      ok: true,
      accepted: { deviceId, scopes: ["read"] },
    });
  });

  it("keeps a new device pending until someone approves it", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const paired = service.pairDevice({ secret: code }, KEY_A, null);
    if (!paired.ok) throw new Error("pairing failed");
    const { deviceId } = paired.result;

    expect(service.connectDevice({ deviceId }, KEY_A)).toEqual({
      ok: false,
      reason: "pending",
      deviceId,
    });
    expect(service.listDevices()[0]).toMatchObject({
      id: deviceId,
      approvedAt: null,
      approvalExpiresAt: "2026-10-11T00:10:00.000Z",
      safetyCode: null,
    });

    expect(
      service.approveDevice(deviceId, codeFor(KEY_A), local),
    ).toMatchObject({
      ok: true,
      device: { approvedAt: "2026-10-11T00:00:00.000Z" },
    });
    expect(service.approveDevice(deviceId, codeFor(KEY_A), local)).toEqual({
      ok: false,
      reason: "notPending",
    });
    expect(service.connectDevice({ deviceId }, KEY_A)).toMatchObject({
      ok: true,
    });
    expect(service.listDevices()[0]).toMatchObject({
      approvalExpiresAt: null,
      safetyCode: codeFor(KEY_A),
    });
  });

  it("wakes a device waiting for approval as soon as it is decided", async () => {
    const { service } = await setup();
    const pair = (key: string) => {
      const { code } = service.createPairing(
        { label: "Phone", scopes: ["read"] },
        local,
      );
      const paired = service.pairDevice({ secret: code }, key, null);
      if (!paired.ok) throw new Error("pairing failed");
      return paired.result.deviceId;
    };
    const approved = pair(KEY_A);
    const revoked = pair(KEY_B);
    const settled = new Set<string>();
    const wait = (deviceId: string) =>
      service
        .waitForDeviceDecision(deviceId, new AbortController().signal)
        .then(() => settled.add(deviceId));
    const waits = [wait(approved), wait(revoked)];

    const wrong = codeFor(KEY_A) === "000000" ? "111111" : "000000";
    service.approveDevice(approved, wrong, local);
    await Promise.resolve();
    expect(settled).toEqual(new Set());

    service.approveDevice(approved, codeFor(KEY_A), local);
    service.revokeDevice(revoked, local);
    await Promise.all(waits);
    expect(settled).toEqual(new Set([approved, revoked]));
  });

  it("refuses and hides a device nobody approved within the window", async () => {
    const { service, advance } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const paired = service.pairDevice({ secret: code }, KEY_A, null);
    if (!paired.ok) throw new Error("pairing failed");
    const { deviceId } = paired.result;
    advance(10 * 60_000 + 1);

    expect(service.connectDevice({ deviceId }, KEY_A)).toEqual({
      ok: false,
      reason: "rejected",
    });
    expect(service.approveDevice(deviceId, codeFor(KEY_A), local)).toEqual({
      ok: false,
      reason: "notPending",
    });
    expect(service.listDevices()).toEqual([]);
  });

  it("approves only with the safety code the device shows", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const paired = service.pairDevice({ secret: code }, KEY_A, null);
    if (!paired.ok) throw new Error("pairing failed");
    const { deviceId } = paired.result;
    const wrong = codeFor(KEY_B) === codeFor(KEY_A) ? "000000" : codeFor(KEY_B);

    expect(service.approveDevice(deviceId, wrong, local)).toEqual({
      ok: false,
      reason: "codeMismatch",
    });
    expect(service.connectDevice({ deviceId }, KEY_A)).toEqual({
      ok: false,
      reason: "pending",
      deviceId,
    });
    const spaced = `${codeFor(KEY_A).slice(0, 3)} ${codeFor(KEY_A).slice(3)}`;
    expect(service.approveDevice(deviceId, spaced, local)).toMatchObject({
      ok: true,
    });
  });

  it("revokes a waiting device after five wrong safety codes", async () => {
    const { service } = await setup();
    const { code } = service.createPairing(
      { label: "Phone", scopes: ["read"] },
      local,
    );
    const paired = service.pairDevice({ secret: code }, KEY_A, null);
    if (!paired.ok) throw new Error("pairing failed");
    const { deviceId } = paired.result;
    const wrong = codeFor(KEY_A) === "111111" ? "222222" : "111111";

    const reasons = Array.from({ length: 5 }, () => {
      const result = service.approveDevice(deviceId, wrong, local);
      return result.ok ? "ok" : result.reason;
    });

    expect(reasons).toEqual([
      "codeMismatch",
      "codeMismatch",
      "codeMismatch",
      "codeMismatch",
      "tooManyAttempts",
    ]);
    expect(service.approveDevice(deviceId, codeFor(KEY_A), local)).toEqual({
      ok: false,
      reason: "notPending",
    });
    expect(service.connectDevice({ deviceId }, KEY_A)).toEqual({
      ok: false,
      reason: "rejected",
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
    service.approveDevice(exchanged.result.deviceId, codeFor("key"), local);
    service.connectDevice({ deviceId: exchanged.result.deviceId }, "key");
    const revoked: string[] = [];
    service.onDeviceAccessChanged((deviceId) => revoked.push(deviceId));
    expect(service.resolveDevice(exchanged.result.deviceId)).not.toBeNull();

    service.revokeDevice(exchanged.result.deviceId, local);

    expect(service.resolveDevice(exchanged.result.deviceId)).toBeNull();
    expect(
      service.connectDevice({ deviceId: exchanged.result.deviceId }, "key"),
    ).toEqual({ ok: false, reason: "rejected" });
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
    service.approveDevice(exchanged.result.deviceId, codeFor("key"), local);
    service.connectDevice({ deviceId: exchanged.result.deviceId }, "key");
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
    ).toMatchObject({ ok: true, accepted: { scopes: ["read", "files.read"] } });
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
    service.approveDevice(exchanged.result.deviceId, codeFor("key"), local);
    service.connectDevice({ deviceId: exchanged.result.deviceId }, "key");

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
      relay: {
        url: null,
        relayOnly: false,
        credential: null,
        state: "off",
        error: null,
        latencyMs: null,
        endpoint: null,
      },
    });
  });

  it("keeps the local listener beside a relay unless relay-only is chosen", async () => {
    const { service } = await setup();
    const listener: boolean[] = [];
    service.bindRemoteListener({
      apply: async (next) => {
        listener.push(next.enabled);
        return { listening: next.enabled, error: null };
      },
      state: () => ({ listening: listener.at(-1) === true, error: null }),
    });
    service.bindRelayConnector({
      apply: () => undefined,
      state: () => ({ state: "online", error: null, latencyMs: 42 }),
    });

    await service.setRemoteAccess({ enabled: true, port: 50_000 }, local);
    const status = await service.setRelay(
      { url: "https://relay.example.invalid" },
      local,
    );

    expect(status.relay.relayOnly).toBe(false);
    expect(listener).toEqual([true, true]);
  });

  it("routes through the relay instead of the local listener in relay-only mode", async () => {
    const { service } = await setup();
    const listener: unknown[] = [];
    const relay: unknown[] = [];
    service.bindRemoteListener({
      apply: async (next) => {
        listener.push(next.enabled);
        return { listening: next.enabled, error: null };
      },
      state: () => ({ listening: listener.at(-1) === true, error: null }),
    });
    service.bindRelayConnector({
      apply: (target) => relay.push(target),
      state: () => ({ state: "online", error: null, latencyMs: 42 }),
    });
    const credential = relayToken({
      sub: "invite-7",
      exp: "2030-03-17T17:46:40Z",
      relay: "https://relay.example.invalid",
    });

    await service.setRemoteAccess({ enabled: true, port: 50_000 }, local);
    const status = await service.setRelay(
      { url: "https://relay.example.invalid/", relayOnly: true, credential },
      local,
    );

    expect(listener).toEqual([true, false]);
    expect(relay).toEqual([
      null,
      { url: "https://relay.example.invalid", credential },
    ]);
    const endpoint = `https://relay.example.invalid/v1/connect/${relayRouteId(HOST_KEY)}`;
    expect(status.relay).toEqual({
      url: "https://relay.example.invalid",
      relayOnly: true,
      credential: {
        accountId: "invite-7",
        expiresAt: "2030-03-17T17:46:40.000Z",
        relayUrl: "https://relay.example.invalid",
      },
      state: "online",
      error: null,
      latencyMs: 42,
      endpoint,
    });
    expect(await service.remoteEndpoints()).toEqual([endpoint]);

    await service.setRelay(
      { url: "https://relay.example.invalid", relayOnly: false },
      local,
    );
    expect(listener.at(-1)).toBe(true);
    expect((await service.readRelaySettings()).credential).toEqual(credential);

    await service.setRemoteAccess({ enabled: false, port: 50_000 }, local);
    expect(listener.at(-1)).toBe(false);
    expect(relay.at(-1)).toBeNull();
    expect((await service.remoteAccessStatus()).relay.state).toBe("off");
    expect(service.listAudit(10).map((entry) => entry.action)).toEqual([
      "remote.disabled",
      "relay.changed",
      "remote.enabled",
    ]);
    await expect(
      service.setRelay({ url: "ftp://relay.example.invalid" }, local),
    ).rejects.toThrow("Relay URL must be an http or https URL");
    await expect(
      service.setRelay(
        { url: "https://other.example.invalid", credential },
        local,
      ),
    ).rejects.toThrow("This credential is for https://relay.example.invalid");
    await service.setRelay({ url: "https://other.example.invalid" }, local);
    expect((await service.readRelaySettings()).credential).toBeNull();
  });
});

function relayToken(claims: Record<string, string>) {
  const body = Buffer.concat([
    Buffer.from(JSON.stringify(claims)),
    Buffer.alloc(64),
  ]);
  return `v4.public.${body.toString("base64url")}`;
}

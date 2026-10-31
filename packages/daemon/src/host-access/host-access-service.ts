import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { HostAccessRepository } from "@cocurdex/db";
import {
  type CreatedHostPairing,
  type CreateHostPairingPayload,
  DEFAULT_REMOTE_ACCESS_PORT,
  type HostAccessAuditAction,
  type HostAccessScope,
  type HostAddress,
  type HostIdentity,
  type HostPrincipal,
  type HostRemoteAccessStatus,
  PAIRABLE_HOST_ACCESS_SCOPES,
  type PairedDeviceRecord,
  type RemoteAccessSettings,
  type RemoteAccessSettingsUpdate,
  type RemoteChannelAccepted,
  type RemotePairRequest,
} from "@cocurdex/shared";

const HOST_ID_SETTING = "host.id";
const REMOTE_ACCESS_SETTING = "host.remoteAccess";
const DEFAULT_PAIRING_TTL_MINUTES = 10;
const MAX_PAIRING_TTL_MINUTES = 60;
const TOUCH_INTERVAL_MS = 60_000;

export interface HostAccessSettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}

export interface HostAccessServiceOptions {
  localToken: string;
  hostKey(): string;
  repository: HostAccessRepository;
  settings: HostAccessSettingsStore;
  hostName(): string;
  listAddresses?(port: number): HostAddress[];
  now?(): Date;
  remoteAccessAllowed?: boolean;
  onRemoteAccessChanged?(): void;
}

export interface RemoteListenerState {
  listening: boolean;
  error: string | null;
}

export interface RemoteListenerController {
  apply(settings: RemoteAccessSettings): Promise<RemoteListenerState>;
  state(): RemoteListenerState;
}

export type HostPairingExchangeOutcome =
  | { ok: true; result: RemoteChannelAccepted }
  | { ok: false; reason: "unknown" | "expired" | "consumed" | "invalid" };

export function hashHostSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function principalActor(principal: HostPrincipal) {
  return principal.kind === "local" ? "local" : `device:${principal.deviceId}`;
}

function secretsMatch(offered: string, expected: string) {
  const left = Buffer.from(offered);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseRemoteAccessSettings(
  valueJson: string | null,
): RemoteAccessSettings {
  const fallback = {
    enabled: false,
    port: DEFAULT_REMOTE_ACCESS_PORT,
    keepAwake: false,
  };
  if (!valueJson) return fallback;
  try {
    const parsed = JSON.parse(valueJson) as Partial<RemoteAccessSettings>;
    return {
      enabled: parsed.enabled === true,
      port: isValidRemotePort(parsed.port) ? parsed.port : fallback.port,
      keepAwake: parsed.keepAwake === true,
    };
  } catch {
    return fallback;
  }
}

export function isValidRemotePort(port: unknown): port is number {
  return (
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65_535
  );
}

function normalizeDeviceScopes(scopes: HostAccessScope[]) {
  const unique = [...new Set(scopes)];
  if (unique.length === 0) {
    throw new Error("A device needs at least one scope");
  }
  const rejected = unique.filter(
    (scope) => !PAIRABLE_HOST_ACCESS_SCOPES.includes(scope),
  );
  if (rejected.length > 0) {
    throw new Error(
      `Scopes cannot be granted to a device: ${rejected.join(", ")}`,
    );
  }
  return unique;
}

function normalizeTtlMinutes(ttlMinutes: number | undefined) {
  const value = ttlMinutes ?? DEFAULT_PAIRING_TTL_MINUTES;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PAIRING_TTL_MINUTES
  ) {
    throw new Error(
      `Pairing TTL must be between 1 and ${MAX_PAIRING_TTL_MINUTES} minutes`,
    );
  }
  return value;
}

export class HostAccessService {
  private hostId: string | null = null;
  private readonly activeDevices = new Map<string, PairedDeviceRecord>();
  private readonly lastTouched = new Map<string, number>();
  private readonly accessListeners = new Set<(deviceId: string) => void>();
  private readonly options: HostAccessServiceOptions;
  private remoteListener: RemoteListenerController | null = null;

  constructor(options: HostAccessServiceOptions) {
    this.options = options;
  }

  private get remoteAccessAllowed() {
    return this.options.remoteAccessAllowed ?? true;
  }

  private assertRemoteAccessAllowed() {
    if (!this.remoteAccessAllowed) {
      throw new Error("Remote access is disabled in this build");
    }
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private audit(
    action: HostAccessAuditAction,
    actor: string,
    subject: string | null,
    remoteAddress: string | null = null,
  ) {
    this.options.repository.appendAudit({
      id: randomUUID(),
      at: this.now().toISOString(),
      action,
      actor,
      subject,
      remoteAddress,
    });
  }

  async initialize() {
    const stored = await this.options.settings.get(HOST_ID_SETTING);
    const parsed = stored ? (JSON.parse(stored) as unknown) : null;
    if (typeof parsed === "string" && parsed.length > 0) {
      this.hostId = parsed;
      return;
    }
    const hostId = randomUUID();
    await this.options.settings.set(HOST_ID_SETTING, JSON.stringify(hostId));
    this.hostId = hostId;
  }

  identity(): HostIdentity {
    if (!this.hostId) throw new Error("Host access is not initialized");
    return { hostId: this.hostId, name: this.options.hostName() };
  }

  hostKey() {
    return this.options.hostKey();
  }

  resolve(token: unknown): HostPrincipal | null {
    if (typeof token !== "string" || token.length === 0) return null;
    return secretsMatch(token, this.options.localToken)
      ? { kind: "local" }
      : null;
  }

  resolveDevice(deviceId: string): HostPrincipal | null {
    const device = this.activeDevices.get(deviceId);
    if (!device) return null;
    this.touch(device.id);
    return { kind: "device", deviceId: device.id, scopes: device.scopes };
  }

  connectDevice(
    request: unknown,
    publicKey: string,
  ): RemoteChannelAccepted | null {
    const deviceId = (request as { deviceId?: unknown } | null)?.deviceId;
    if (typeof deviceId !== "string") return null;
    const device =
      this.options.repository.findActiveDeviceByPublicKey(publicKey);
    if (!device || device.id !== deviceId) return null;
    this.activeDevices.set(device.id, device);
    this.touch(device.id);
    return this.accepted(device);
  }

  private accepted(device: PairedDeviceRecord): RemoteChannelAccepted {
    return {
      host: this.identity(),
      deviceId: device.id,
      scopes: device.scopes,
    };
  }

  private touch(deviceId: string) {
    const now = this.now();
    const last = this.lastTouched.get(deviceId) ?? 0;
    if (now.getTime() - last < TOUCH_INTERVAL_MS) return;
    this.lastTouched.set(deviceId, now.getTime());
    this.options.repository.touchDevice(deviceId, now.toISOString());
  }

  createPairing(
    payload: CreateHostPairingPayload,
    principal: HostPrincipal,
  ): CreatedHostPairing {
    this.assertRemoteAccessAllowed();
    const label = payload.label.trim();
    if (!label) throw new Error("A pairing needs a label");
    const scopes = normalizeDeviceScopes(payload.scopes);
    const ttlMinutes = normalizeTtlMinutes(payload.ttlMinutes);
    const now = this.now();
    const code = randomBytes(18).toString("base64url");
    const pairing = {
      id: randomUUID(),
      label,
      scopes,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
      consumedAt: null,
      deviceId: null,
    };
    this.options.repository.insertPairing(pairing, hashHostSecret(code));
    this.audit("pairing.created", principalActor(principal), pairing.id);
    return { pairing, code, hostKey: this.hostKey() };
  }

  listPairings() {
    return this.options.repository.listPendingPairings(
      this.now().toISOString(),
    );
  }

  cancelPairing(pairingId: string, principal: HostPrincipal) {
    const pairing = this.options.repository.deletePendingPairing(pairingId);
    if (pairing) {
      this.audit("pairing.cancelled", principalActor(principal), pairing.id);
    }
    return pairing;
  }

  pairDevice(
    request: unknown,
    publicKey: string,
    remoteAddress: string | null,
  ): HostPairingExchangeOutcome {
    const { secret, label } = (request ?? {}) as Partial<RemotePairRequest>;
    if (typeof secret !== "string" || secret.length === 0) {
      this.audit("pairing.rejected", "anonymous", null, remoteAddress);
      return { ok: false, reason: "invalid" };
    }
    const now = this.now().toISOString();
    const outcome = this.options.repository.consumePairing(
      hashHostSecret(secret),
      now,
      {
        id: randomUUID(),
        label: typeof label === "string" ? label.trim().slice(0, 120) : "",
        publicKey,
        createdAt: now,
      },
    );
    if (!outcome.ok) {
      this.audit("pairing.rejected", "anonymous", null, remoteAddress);
      return outcome;
    }
    this.audit(
      "pairing.exchanged",
      `device:${outcome.device.id}`,
      outcome.pairing.id,
      remoteAddress,
    );
    this.activeDevices.set(outcome.device.id, outcome.device);
    return { ok: true, result: this.accepted(outcome.device) };
  }

  listDevices() {
    return this.options.repository.listDevices();
  }

  revokeDevice(deviceId: string, principal: HostPrincipal) {
    const device = this.options.repository.revokeDevice(
      deviceId,
      this.now().toISOString(),
    );
    if (!device) return null;
    this.audit("device.revoked", principalActor(principal), deviceId);
    this.deviceAccessChanged(deviceId);
    return device;
  }

  revokeSelf(principal: HostPrincipal) {
    if (principal.kind !== "device") {
      throw new Error("Only a paired device can unpair itself");
    }
    const device = this.options.repository.revokeDevice(
      principal.deviceId,
      this.now().toISOString(),
    );
    if (!device) return null;
    this.audit("device.revoked", principalActor(principal), device.id);
    this.activeDevices.delete(device.id);
    return device;
  }

  updateDeviceScopes(
    deviceId: string,
    scopes: HostAccessScope[],
    principal: HostPrincipal,
  ) {
    const device = this.options.repository.updateDeviceScopes(
      deviceId,
      normalizeDeviceScopes(scopes),
    );
    if (!device) return null;
    this.audit("device.scopesChanged", principalActor(principal), deviceId);
    this.deviceAccessChanged(deviceId);
    return device;
  }

  private deviceAccessChanged(deviceId: string) {
    this.activeDevices.delete(deviceId);
    this.disconnectDevice(deviceId);
  }

  disconnectDevice(deviceId: string) {
    for (const listener of this.accessListeners) listener(deviceId);
  }

  onDeviceAccessChanged(listener: (deviceId: string) => void) {
    this.accessListeners.add(listener);
    return () => this.accessListeners.delete(listener);
  }

  listAudit(limit: number) {
    return this.options.repository.listAudit(limit);
  }

  async readRemoteAccessSettings() {
    return parseRemoteAccessSettings(
      await this.options.settings.get(REMOTE_ACCESS_SETTING),
    );
  }

  async saveRemoteAccessSettings(
    settings: RemoteAccessSettingsUpdate,
    principal: HostPrincipal,
  ) {
    if (!isValidRemotePort(settings.port)) {
      throw new Error("Remote access port must be between 1024 and 65535");
    }
    const previous = await this.readRemoteAccessSettings();
    const next = {
      enabled: settings.enabled,
      port: settings.port,
      keepAwake: settings.keepAwake ?? previous.keepAwake,
    };
    await this.options.settings.set(
      REMOTE_ACCESS_SETTING,
      JSON.stringify(next),
    );
    if (previous.enabled !== next.enabled) {
      this.audit(
        next.enabled ? "remote.enabled" : "remote.disabled",
        principalActor(principal),
        String(next.port),
      );
    }
    return next;
  }

  bindRemoteListener(controller: RemoteListenerController) {
    this.remoteListener = controller;
  }

  async startRemoteListener() {
    if (!this.remoteAccessAllowed) return;
    const settings = await this.readRemoteAccessSettings();
    if (settings.enabled) await this.remoteListener?.apply(settings);
  }

  async remoteAccessStatus(): Promise<HostRemoteAccessStatus> {
    const stored = await this.readRemoteAccessSettings();
    const allowed = this.remoteAccessAllowed;
    const settings = allowed ? stored : { ...stored, enabled: false };
    const state = this.remoteListener?.state() ?? {
      listening: false,
      error: null,
    };
    return {
      allowed,
      settings,
      listening: state.listening,
      addresses: state.listening
        ? (this.options.listAddresses?.(settings.port) ?? [])
        : [],
      error: state.error,
    };
  }

  async remoteEndpoints() {
    const status = await this.remoteAccessStatus();
    return status.addresses.map((address) => address.url);
  }

  async setRemoteAccess(
    settings: RemoteAccessSettingsUpdate,
    principal: HostPrincipal,
  ) {
    if (settings.enabled) this.assertRemoteAccessAllowed();
    const saved = await this.saveRemoteAccessSettings(settings, principal);
    await this.remoteListener?.apply(saved);
    this.options.onRemoteAccessChanged?.();
    return this.remoteAccessStatus();
  }
}

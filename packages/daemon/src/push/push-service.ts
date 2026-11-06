import type { KeyObject } from "node:crypto";
import type { HostAccessRepository } from "@cocurdex/db";
import {
  decodeBase64Url,
  encodeBase64Url,
  type NoiseCrypto,
  sealMessage,
} from "@cocurdex/secure-channel";
import {
  type DevicePushRegistrationResult,
  type HostIdentity,
  type HostPrincipal,
  type HostPushStatus,
  normalizeRelayUrl,
  PUSH_SEAL_PROLOGUE,
  type PushRegistration,
  type PushSettings,
  type PushSettingsUpdate,
  type SessionRecord,
} from "@cocurdex/shared";
import {
  buildPushContent,
  encodePushContent,
  type PushTrigger,
  pushCollapseId,
  pushExpiresAt,
} from "./push-content";
import {
  createPushGatewayClient,
  type PushGatewayClient,
} from "./push-gateway-client";

const PUSH_SETTING = "host.push";
const NOTIFY_SCOPE = "read";
const prologue = new TextEncoder().encode(PUSH_SEAL_PROLOGUE);

export interface PushSettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}

export interface PushServiceOptions {
  repository: Pick<
    HostAccessRepository,
    "setDevicePush" | "clearDevicePushHandle" | "listPushTargets"
  >;
  settings: PushSettingsStore;
  signingKey(): KeyObject;
  identity(): HostIdentity;
  crypto: NoiseCrypto;
  defaultGatewayUrl?: string | null;
  fetch?: typeof fetch;
  now?(): Date;
}

function parsePushSettings(
  valueJson: string | null,
  fallbackUrl: string | null,
): PushSettings {
  if (!valueJson) return { url: fallbackUrl };
  try {
    const parsed = JSON.parse(valueJson) as Partial<PushSettings>;
    return {
      url:
        typeof parsed.url === "string" ? normalizeRelayUrl(parsed.url) : null,
    };
  } catch {
    return { url: fallbackUrl };
  }
}

export interface PreparedPush {
  targetHandle: string;
  plaintext: Uint8Array;
  collapseId: string;
  expiresAt: number;
}

export type PushSendResult = "sent" | "failed" | "gone";

function requireDevice(principal: HostPrincipal) {
  if (principal.kind !== "device") {
    throw new Error("Only a paired device can register for notifications");
  }
  return principal.deviceId;
}

export class PushService {
  private client: { url: string; gateway: PushGatewayClient } | null = null;

  constructor(private readonly options: PushServiceOptions) {}

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private async readSettings() {
    return parsePushSettings(
      await this.options.settings.get(PUSH_SETTING),
      this.options.defaultGatewayUrl ?? null,
    );
  }

  private gateway(url: string) {
    if (this.client?.url !== url) {
      this.client = {
        url,
        gateway: createPushGatewayClient({
          url,
          signingKey: this.options.signingKey(),
          fetch: this.options.fetch,
          now: this.options.now,
        }),
      };
    }
    return this.client.gateway;
  }

  async status(): Promise<HostPushStatus> {
    const settings = await this.readSettings();
    return { url: settings.url };
  }

  async setSettings(update: PushSettingsUpdate): Promise<HostPushStatus> {
    const url = update.url === null ? null : normalizeRelayUrl(update.url);
    if (update.url !== null && !url) {
      throw new Error("Push gateway URL must be an http or https URL");
    }
    await this.options.settings.set(PUSH_SETTING, JSON.stringify({ url }));
    return this.status();
  }

  async register(
    principal: HostPrincipal,
    registration: PushRegistration,
  ): Promise<DevicePushRegistrationResult> {
    const deviceId = requireDevice(principal);
    const { url } = await this.readSettings();
    if (!url) return { registered: false };
    const handle = await this.gateway(url).issueHandle(registration);
    const stored = this.options.repository.setDevicePush(
      deviceId,
      { platform: registration.platform, handle },
      this.now().toISOString(),
    );
    return { registered: stored };
  }

  unregister(principal: HostPrincipal): DevicePushRegistrationResult {
    const deviceId = requireDevice(principal);
    this.options.repository.setDevicePush(
      deviceId,
      null,
      this.now().toISOString(),
    );
    return { registered: false };
  }

  private notifyTargets() {
    return this.options.repository
      .listPushTargets()
      .filter((target) => target.scopes.includes(NOTIFY_SCOPE));
  }

  async prepare(
    trigger: PushTrigger,
    session: SessionRecord,
  ): Promise<PreparedPush[]> {
    const targets = this.notifyTargets();
    if (targets.length === 0) return [];
    const { url } = await this.readSettings();
    if (!url) return [];
    const plaintext = encodePushContent(
      buildPushContent(trigger, session, this.options.identity()),
    );
    const collapseId = pushCollapseId(trigger);
    const expiresAt = pushExpiresAt(trigger, this.now());
    return targets.map((target) => ({
      targetHandle: target.handle,
      plaintext,
      collapseId,
      expiresAt,
    }));
  }

  async send(push: PreparedPush): Promise<PushSendResult> {
    const target = this.notifyTargets().find(
      (entry) => entry.handle === push.targetHandle,
    );
    if (!target) return "gone";
    const { url } = await this.readSettings();
    if (!url) return "gone";
    const sealed = sealMessage({
      crypto: this.options.crypto,
      recipientPublicKey: decodeBase64Url(target.publicKey),
      prologue,
      plaintext: push.plaintext,
    });
    const outcome = await this.gateway(url).send({
      handle: target.handle,
      ciphertext: encodeBase64Url(sealed),
      collapseId: push.collapseId,
      priority: "high",
      expiresAt: push.expiresAt,
    });
    if (outcome === "unregistered") {
      this.options.repository.clearDevicePushHandle(
        target.handle,
        this.now().toISOString(),
      );
      return "gone";
    }
    return outcome;
  }
}

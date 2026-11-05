import type { KeyObject } from "node:crypto";
import type { HostAccessRepository, PushTarget } from "@cocurdex/db";
import {
  decodeBase64Url,
  encodeBase64Url,
  type NoiseCrypto,
  sealMessage,
} from "@cocurdex/secure-channel";
import {
  type AgentEvent,
  type DevicePushRegistrationResult,
  type HostIdentity,
  type HostPrincipal,
  type HostPushStatus,
  normalizeRelayUrl,
  PUSH_SEAL_PROLOGUE,
  type PushNotificationKind,
  type PushRegistration,
  type PushSettings,
  type PushSettingsUpdate,
  type SessionRecord,
} from "@cocurdex/shared";
import {
  buildPushContent,
  encodePushContent,
  pushCollapseId,
  pushExpiresAt,
  pushTriggerForEvent,
  shouldNotifyForSession,
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
  getSession(sessionId: string): Promise<SessionRecord | null>;
  allows?(session: SessionRecord, kind: PushNotificationKind): boolean;
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

  async notify(event: AgentEvent): Promise<void> {
    const now = this.now();
    const trigger = pushTriggerForEvent(event, now);
    if (!trigger) return;
    const targets = this.options.repository
      .listPushTargets()
      .filter((target) => target.scopes.includes(NOTIFY_SCOPE));
    if (targets.length === 0) return;
    const { url } = await this.readSettings();
    if (!url) return;
    const session = await this.options.getSession(trigger.sessionId);
    if (!session || !shouldNotifyForSession(session)) return;
    if (this.options.allows && !this.options.allows(session, trigger.kind)) {
      return;
    }
    const plaintext = encodePushContent(
      buildPushContent(trigger, session, this.options.identity()),
    );
    const gateway = this.gateway(url);
    await Promise.all(
      targets.map((target) =>
        this.deliver(gateway, target, plaintext, {
          collapseId: pushCollapseId(trigger),
          expiresAt: pushExpiresAt(trigger, now),
        }),
      ),
    );
  }

  private async deliver(
    gateway: PushGatewayClient,
    target: PushTarget,
    plaintext: Uint8Array,
    meta: { collapseId: string; expiresAt: number },
  ) {
    const sealed = sealMessage({
      crypto: this.options.crypto,
      recipientPublicKey: decodeBase64Url(target.publicKey),
      prologue,
      plaintext,
    });
    const outcome = await gateway.send({
      handle: target.handle,
      ciphertext: encodeBase64Url(sealed),
      collapseId: meta.collapseId,
      priority: "high",
      expiresAt: meta.expiresAt,
    });
    if (outcome === "unregistered") {
      this.options.repository.clearDevicePushHandle(
        target.handle,
        this.now().toISOString(),
      );
    }
  }
}

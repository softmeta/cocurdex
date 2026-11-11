import type { DocumentAttachment, ImageAttachment } from "./contracts";
import type { PushPlatform } from "./push";

export const HOST_ACCESS_SCOPES = [
  "read",
  "interact",
  "execute",
  "files.read",
  "files.write",
  "git.destructive",
  "approvals",
  "credentials",
  "devices",
  "host.admin",
] as const;

export type HostAccessScope = (typeof HOST_ACCESS_SCOPES)[number];

export const PAIRABLE_HOST_ACCESS_SCOPES: readonly HostAccessScope[] =
  HOST_ACCESS_SCOPES.filter((scope) => scope !== "host.admin");

export function isHostAccessScope(value: string): value is HostAccessScope {
  return (HOST_ACCESS_SCOPES as readonly string[]).includes(value);
}

export type HostPrincipal =
  | { kind: "local" }
  | { kind: "device"; deviceId: string; scopes: HostAccessScope[] };

export function principalHasScope(
  principal: HostPrincipal,
  scope: HostAccessScope,
) {
  return principal.kind === "local" || principal.scopes.includes(scope);
}

export interface HostIdentity {
  hostId: string;
  name: string;
}

export interface HostAccessSession {
  host: HostIdentity;
  principal: HostPrincipal;
  endpoints?: string[];
}

export interface PairedDeviceRecord {
  id: string;
  label: string;
  scopes: HostAccessScope[];
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  approvedAt: string | null;
  publicKey: string | null;
  pushPlatform: PushPlatform | null;
}

export interface PairedDevice extends PairedDeviceRecord {
  safetyCode: string | null;
  approvalExpiresAt: string | null;
}

export interface HostPairingRecord {
  id: string;
  label: string;
  scopes: HostAccessScope[];
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  deviceId: string | null;
}

export interface CreatedHostPairing {
  pairing: HostPairingRecord;
  code: string;
  hostKey: string;
}

export interface CreateHostPairingPayload {
  label: string;
  scopes: HostAccessScope[];
  ttlMinutes?: number;
}

export interface RemotePairRequest {
  secret: string;
  label?: string;
}

export type RemoteMessageCompression = "deflate-raw";

export interface RemoteConnectRequest {
  deviceId: string;
  compression?: RemoteMessageCompression[];
}

export interface RemoteChannelAccepted {
  host: HostIdentity;
  deviceId: string;
  scopes: HostAccessScope[];
  endpoints?: string[];
  compression?: RemoteMessageCompression;
}

export interface RemoteByteRange {
  start: number;
  end?: number;
}

export type RemoteFileRequest =
  | { kind: "workspaceFile"; path: string; range?: RemoteByteRange }
  | { kind: "pdf"; path: string; range?: RemoteByteRange }
  | { kind: "imageAttachment"; file: string }
  | { kind: "deckAsset"; hash: string }
  | { kind: "deckDownload"; ticket: string }
  | { kind: "attachmentUpload"; upload: "image" | "document"; name: string };

export type RemoteFileFailure =
  | "forbidden"
  | "invalid"
  | "notFound"
  | "unsatisfiable"
  | "tooLarge"
  | "unsupported";

export type RemoteFileHead =
  | {
      ok: true;
      size: number;
      start: number;
      end: number;
      contentType: string;
      fileName?: string;
    }
  | { ok: true; uploaded: ImageAttachment | DocumentAttachment }
  | { ok: false; error: RemoteFileFailure; message?: string };

export type RemoteChannelRejection = "rejected" | "rateLimited" | "pending";

export type RemoteChannelReply =
  | ({ ok: true } & RemoteChannelAccepted)
  | { ok: false; reason: RemoteChannelRejection };

export type HostAccessAuditAction =
  | "pairing.created"
  | "pairing.cancelled"
  | "pairing.exchanged"
  | "pairing.rejected"
  | "device.approved"
  | "device.revoked"
  | "device.scopesChanged"
  | "remote.enabled"
  | "remote.disabled"
  | "relay.changed";

export interface HostAccessAuditEntry {
  id: string;
  at: string;
  action: HostAccessAuditAction;
  actor: string;
  subject: string | null;
  remoteAddress: string | null;
}

export interface RemoteAccessSettings {
  enabled: boolean;
  port: number;
  keepAwake: boolean;
}

export type RemoteAccessSettingsUpdate = Omit<
  RemoteAccessSettings,
  "keepAwake"
> &
  Partial<Pick<RemoteAccessSettings, "keepAwake">>;

export type HostAddressKind = "lan" | "tailscale" | "relay";

export interface HostAddress {
  address: string;
  kind: HostAddressKind;
  url: string;
}

export interface RelayCredential {
  accountId: string;
  expiresAt: string;
  relayUrl: string;
}

export interface RelaySettings {
  url: string | null;
  relayOnly: boolean;
  credential: string | null;
}

export interface RelaySettingsUpdate {
  url: string | null;
  relayOnly?: boolean;
  credential?: string | null;
}

export type HostRelayState = "off" | "connecting" | "online" | "offline";

export type HostRelayError =
  | "unreachable"
  | "credentialRequired"
  | "rateLimited"
  | "unauthorized"
  | "protocol"
  | "outdated"
  | "replaced";

export interface HostRelayStatus {
  url: string | null;
  relayOnly: boolean;
  credential: RelayCredential | null;
  state: HostRelayState;
  error: HostRelayError | null;
  latencyMs: number | null;
  endpoint: string | null;
}

const RELAY_TOKEN_PATTERN = /^v4\.public\.[A-Za-z0-9_-]+$/;
const ED25519_SIGNATURE_BYTES = 64;

function decodeBase64Url(text: string) {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function readRelayTokenClaims(token: string): unknown {
  const body = decodeBase64Url(token.slice("v4.public.".length));
  if (body.length <= ED25519_SIGNATURE_BYTES) return null;
  const message = body.subarray(0, body.length - ED25519_SIGNATURE_BYTES);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(message));
}

export function parseRelayCredential(token: string): RelayCredential | null {
  if (!RELAY_TOKEN_PATTERN.test(token)) return null;
  let claims: { sub?: unknown; exp?: unknown; relay?: unknown } | null;
  try {
    claims = readRelayTokenClaims(token) as typeof claims;
  } catch {
    return null;
  }
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
    return null;
  }
  const expires =
    typeof claims.exp === "string" ? new Date(claims.exp) : new Date(NaN);
  const relayUrl =
    typeof claims.relay === "string" ? normalizeRelayUrl(claims.relay) : null;
  if (Number.isNaN(expires.getTime()) || !relayUrl) return null;
  return {
    accountId: claims.sub,
    expiresAt: expires.toISOString(),
    relayUrl,
  };
}

export const RELAY_OFF_STATUS: HostRelayStatus = {
  url: null,
  relayOnly: false,
  credential: null,
  state: "off",
  error: null,
  latencyMs: null,
  endpoint: null,
};

export type HostTrafficTransport = "relay" | "direct";

export type HostTrafficDirection = "sent" | "received";

export interface HostTrafficMessages {
  transport: HostTrafficTransport;
  direction: HostTrafficDirection;
  category: string;
  messages: number;
  bytes: number;
}

export interface HostTrafficFrames {
  transport: HostTrafficTransport;
  direction: HostTrafficDirection;
  frames: number;
  bytes: number;
}

export interface HostTrafficReport {
  since: string;
  frames: HostTrafficFrames[];
  messages: HostTrafficMessages[];
}

export interface HostRemoteAccessStatus {
  allowed: boolean;
  settings: RemoteAccessSettings;
  listening: boolean;
  addresses: HostAddress[];
  error: string | null;
  relay: HostRelayStatus;
}

const PAIRING_ADDRESS_ORDER: Record<HostAddressKind, number> = {
  relay: 0,
  tailscale: 1,
  lan: 2,
};

export function hostPairingAddresses(
  status: Pick<HostRemoteAccessStatus, "addresses" | "relay">,
): HostAddress[] {
  const { endpoint, state } = status.relay;
  const relay: HostAddress[] =
    endpoint && state === "online"
      ? [{ address: new URL(endpoint).host, kind: "relay", url: endpoint }]
      : [];
  return [...relay, ...status.addresses].sort(
    (left, right) =>
      PAIRING_ADDRESS_ORDER[left.kind] - PAIRING_ADDRESS_ORDER[right.kind],
  );
}

export const OFFICIAL_RELAY_URL = "https://relay.cocurdex.com";

export const RELAY_CONNECT_PATH = "/v1/connect/";

export function normalizeRelayUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

export function buildRelayEndpoint(relayUrl: string, routeId: string) {
  return `${relayUrl}${RELAY_CONNECT_PATH}${routeId}`;
}

export const DEFAULT_REMOTE_ACCESS_PORT = 47_820;

export function buildLocalWebClientUrl(webSocketUrl: string, token: string) {
  const url = new URL(webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export const HOST_PAIRING_LINK_PARAM = "pair";
export const HOST_KEY_LINK_PARAM = "hk";

const RELAY_ROUTE_PATH = /\/v1\/connect\/[A-Za-z0-9_-]{22}$/;

export function hostEndpointBase(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const pathname = url.pathname.replace(/\/+$/, "");
  return RELAY_ROUTE_PATH.test(pathname)
    ? `${url.origin}${pathname}`
    : url.origin;
}

export function isRelayEndpoint(value: string) {
  const base = hostEndpointBase(value);
  return base !== null && RELAY_ROUTE_PATH.test(new URL(base).pathname);
}

export function buildHostPairingLink(
  addressUrl: string,
  code: string,
  hostKey: string,
) {
  const base = hostEndpointBase(addressUrl);
  if (!base) throw new Error(`Not a host address: ${addressUrl}`);
  const url = new URL(base);
  url.hash = new URLSearchParams({
    [HOST_PAIRING_LINK_PARAM]: code,
    [HOST_KEY_LINK_PARAM]: hostKey,
  }).toString();
  return url.toString();
}

const HOST_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function asciiPunctuation(text: string) {
  return text.normalize("NFKC").replaceAll("\u3002", ".");
}

export function parseHostPairingLink(link: string) {
  let url: URL;
  try {
    url = new URL(asciiPunctuation(link).trim());
  } catch {
    return null;
  }
  const baseUrl = hostEndpointBase(url.toString());
  if (!baseUrl) return null;
  const params = new URLSearchParams(url.hash.slice(1));
  const code = params.get(HOST_PAIRING_LINK_PARAM)?.trim();
  const hostKey = params.get(HOST_KEY_LINK_PARAM)?.trim();
  if (!code || !hostKey || !HOST_KEY_PATTERN.test(hostKey)) return null;
  return { baseUrl, code, hostKey };
}

export type HostDeviceApprovalFailure =
  | "notPending"
  | "codeMismatch"
  | "tooManyAttempts";

export type HostDeviceApproval =
  | { ok: true; device: PairedDeviceRecord }
  | { ok: false; reason: HostDeviceApprovalFailure };

export interface RemoteHostEndpoint {
  kind: "paired";
  baseUrl: string;
  hostId: string;
  hostKey: string;
  deviceId: string;
  deviceSecretKey: string;
}

export type RemoteHostStatus =
  | "unknown"
  | "connected"
  | "pending"
  | "offline"
  | "rejected";

export interface RemoteHostRecord {
  hostId: string;
  name: string;
  baseUrl: string;
  deviceId: string;
  scopes: HostAccessScope[];
  pairedAt: string;
  safetyCode: string;
  status: RemoteHostStatus;
  error: string | null;
}

export type RemoteHostPairPayload =
  | { link: string; label?: string | null }
  | { baseUrl: string; code: string; hostKey: string; label?: string | null };

export interface RemoteHostPairing {
  host: RemoteHostRecord;
  missingScopes: HostAccessScope[];
}

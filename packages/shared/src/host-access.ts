import type { DocumentAttachment, ImageAttachment } from "./contracts";

export const HOST_ACCESS_SCOPES = [
  "read",
  "interact",
  "execute",
  "files.read",
  "files.write",
  "git.destructive",
  "approvals",
  "credentials",
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
  publicKey: string | null;
}

export interface PairedDevice extends PairedDeviceRecord {
  safetyCode: string | null;
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

export interface RemoteConnectRequest {
  deviceId: string;
}

export interface RemoteChannelAccepted {
  host: HostIdentity;
  deviceId: string;
  scopes: HostAccessScope[];
  endpoints?: string[];
}

export interface RemoteByteRange {
  start: number;
  end?: number;
}

export type RemoteFileRequest =
  | { kind: "workspaceFile"; path: string; range?: RemoteByteRange }
  | { kind: "pdf"; path: string; range?: RemoteByteRange }
  | { kind: "imageAttachment"; file: string }
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
    }
  | { ok: true; uploaded: ImageAttachment | DocumentAttachment }
  | { ok: false; error: RemoteFileFailure; message?: string };

export type RemoteChannelRejection = "rejected" | "rateLimited";

export type RemoteChannelReply =
  | ({ ok: true } & RemoteChannelAccepted)
  | { ok: false; reason: RemoteChannelRejection };

export type HostAccessAuditAction =
  | "pairing.created"
  | "pairing.cancelled"
  | "pairing.exchanged"
  | "pairing.rejected"
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
  expiresAt: number;
  signature: string;
}

export interface RelaySettings {
  url: string | null;
  relayOnly: boolean;
  credential: RelayCredential | null;
}

export interface RelaySettingsUpdate {
  url: string | null;
  relayOnly?: boolean;
  credential?: RelayCredential | null;
}

export type HostRelayState = "off" | "connecting" | "online" | "offline";

export type HostRelayError =
  | "unreachable"
  | "credentialRequired"
  | "routeTaken"
  | "rateLimited"
  | "unauthorized"
  | "protocol";

export interface HostRelayStatus {
  url: string | null;
  relayOnly: boolean;
  credential: Pick<RelayCredential, "accountId" | "expiresAt"> | null;
  state: HostRelayState;
  error: HostRelayError | null;
  endpoint: string | null;
}

export function parseRelayCredential(text: string): RelayCredential | null {
  let parsed: Partial<RelayCredential> | null;
  try {
    parsed = JSON.parse(text.trim()) as Partial<RelayCredential> | null;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.accountId !== "string" ||
    parsed.accountId.length === 0 ||
    !Number.isInteger(parsed.expiresAt) ||
    typeof parsed.signature !== "string" ||
    !/^[A-Za-z0-9_-]{86}$/.test(parsed.signature)
  ) {
    return null;
  }
  return {
    accountId: parsed.accountId,
    expiresAt: parsed.expiresAt as number,
    signature: parsed.signature,
  };
}

export const RELAY_OFF_STATUS: HostRelayStatus = {
  url: null,
  relayOnly: true,
  credential: null,
  state: "off",
  error: null,
  endpoint: null,
};

export interface HostRemoteAccessStatus {
  allowed: boolean;
  settings: RemoteAccessSettings;
  listening: boolean;
  addresses: HostAddress[];
  error: string | null;
  relay: HostRelayStatus;
}

export function hostPairingAddresses(
  status: Pick<HostRemoteAccessStatus, "addresses" | "relay">,
): HostAddress[] {
  const { endpoint } = status.relay;
  if (!endpoint) return status.addresses;
  const relay: HostAddress = {
    address: new URL(endpoint).host,
    kind: "relay",
    url: endpoint,
  };
  return [relay, ...status.addresses];
}

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

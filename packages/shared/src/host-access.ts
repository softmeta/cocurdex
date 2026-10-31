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
}

export interface PairedDeviceRecord {
  id: string;
  label: string;
  scopes: HostAccessScope[];
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
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
}

export interface CreateHostPairingPayload {
  label: string;
  scopes: HostAccessScope[];
  ttlMinutes?: number;
}

export interface HostPairingExchangeRequest {
  code: string;
  label?: string;
}

export interface HostPairingExchangeResult {
  host: HostIdentity;
  deviceId: string;
  token: string;
  scopes: HostAccessScope[];
}

export type HostAccessAuditAction =
  | "pairing.created"
  | "pairing.cancelled"
  | "pairing.exchanged"
  | "pairing.rejected"
  | "device.revoked"
  | "device.scopesChanged"
  | "remote.enabled"
  | "remote.disabled";

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
}

export type HostAddressKind = "lan" | "tailscale";

export interface HostAddress {
  address: string;
  kind: HostAddressKind;
  url: string;
}

export interface HostRemoteAccessStatus {
  allowed: boolean;
  settings: RemoteAccessSettings;
  listening: boolean;
  addresses: HostAddress[];
  error: string | null;
}

export const HOST_PAIRING_HTTP_PATH = "/api/pair";
export const HOST_SESSION_HTTP_PATH = "/api/session";
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

export function buildHostPairingLink(addressUrl: string, code: string) {
  const url = new URL(addressUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = new URLSearchParams({
    [HOST_PAIRING_LINK_PARAM]: code,
  }).toString();
  return url.toString();
}

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
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const code = new URLSearchParams(url.hash.slice(1))
    .get(HOST_PAIRING_LINK_PARAM)
    ?.trim();
  return code ? { baseUrl: url.origin, code } : null;
}

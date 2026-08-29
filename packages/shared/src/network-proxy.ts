/**
 * App-level network proxy settings.
 *
 * Scope: agent child processes, app/daemon outbound HTTP (Node fetch with
 * NODE_USE_ENV_PROXY), and Electron Chromium traffic. Does not hijack the
 * integrated terminal PTY by default.
 */

export const NETWORK_PROXY_SETTING_KEY = "network.proxy";

export const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "FTP_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "ftp_proxy",
] as const;

export type ProxyEnvKey = (typeof PROXY_ENV_KEYS)[number];

export type NetworkProxyMode = "off" | "system" | "manual";

export interface NetworkProxySettings {
  mode: NetworkProxyMode;
  /** HTTP proxy URL, e.g. http://127.0.0.1:7890 or http://user:pass@host:port */
  httpProxy: string;
  /** HTTPS proxy URL; empty means reuse httpProxy */
  httpsProxy: string;
  /** Optional socks / catch-all proxy (ALL_PROXY) */
  allProxy: string;
  /** Comma-separated bypass hosts; empty uses DEFAULT_NO_PROXY in manual mode */
  noProxy: string;
}

/**
 * Outcome of an outbound connectivity probe. `ok` reports whether the request
 * completed; the egress fields describe where it surfaced, so a proxy that
 * connects without changing the exit node is still recognizable.
 */
export type NetworkProxyTestResult =
  | {
      ok: true;
      durationMs: number;
      ip: string | null;
      city: string | null;
      country: string | null;
      org: string | null;
    }
  | {
      ok: false;
      durationMs: number;
      error: string;
    };

/**
 * "San Francisco, US · AS13335 Cloudflare" — whichever parts the probe knows.
 * Where the request surfaced is what tells the user the proxy is really in the
 * path.
 */
export function formatProxyEgressDetail(
  result: NetworkProxyTestResult,
): string | null {
  if (!result.ok) {
    return null;
  }
  const place = [result.city, result.country].filter(Boolean).join(", ");
  const parts = [place, result.org].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Strip userinfo from a proxy URL so chrome / logs can show the endpoint
 * without echoing stored credentials.
 */
export function redactProxyUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (!url.username && !url.password) {
      return trimmed;
    }
    const port = url.port ? `:${url.port}` : "";
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.protocol}//***@${url.hostname}${port}${path}${url.search}${url.hash}`;
  } catch {
    return trimmed;
  }
}

export const DEFAULT_NO_PROXY = "localhost,127.0.0.1,::1,.local";

export const DEFAULT_NETWORK_PROXY_SETTINGS: NetworkProxySettings = {
  mode: "system",
  httpProxy: "",
  httpsProxy: "",
  allProxy: "",
  noProxy: DEFAULT_NO_PROXY,
};

export type EnvMap = Record<string, string | undefined>;

export function isNetworkProxyMode(value: unknown): value is NetworkProxyMode {
  return value === "off" || value === "system" || value === "manual";
}

export function parseNetworkProxySettings(
  raw: string | null | undefined,
): NetworkProxySettings {
  if (!raw) {
    return { ...DEFAULT_NETWORK_PROXY_SETTINGS };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NetworkProxySettings>;
    return normalizeNetworkProxySettings(parsed);
  } catch {
    return { ...DEFAULT_NETWORK_PROXY_SETTINGS };
  }
}

export function normalizeNetworkProxySettings(
  input: Partial<NetworkProxySettings> | null | undefined,
): NetworkProxySettings {
  const rawMode = input?.mode;
  const mode = isNetworkProxyMode(rawMode)
    ? rawMode
    : DEFAULT_NETWORK_PROXY_SETTINGS.mode;

  return {
    mode,
    httpProxy:
      typeof input?.httpProxy === "string"
        ? input.httpProxy.trim()
        : DEFAULT_NETWORK_PROXY_SETTINGS.httpProxy,
    httpsProxy:
      typeof input?.httpsProxy === "string"
        ? input.httpsProxy.trim()
        : DEFAULT_NETWORK_PROXY_SETTINGS.httpsProxy,
    allProxy:
      typeof input?.allProxy === "string"
        ? input.allProxy.trim()
        : DEFAULT_NETWORK_PROXY_SETTINGS.allProxy,
    noProxy:
      typeof input?.noProxy === "string"
        ? input.noProxy.trim()
        : DEFAULT_NETWORK_PROXY_SETTINGS.noProxy,
  };
}

export function serializeNetworkProxySettings(
  settings: NetworkProxySettings,
): string {
  return JSON.stringify(normalizeNetworkProxySettings(settings));
}

const PROXY_URL_SCHEMES = new Set([
  "http:",
  "https:",
  "socks4:",
  "socks5:",
  "socks5h:",
]);

/**
 * Validate a user-entered proxy URL. Empty means "unset" and is valid.
 * A scheme is required: bare `host:port` is parsed inconsistently by the
 * agent CLIs and by Chromium, which silently degrades to no proxy at all.
 */
export function isValidProxyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return PROXY_URL_SCHEMES.has(url.protocol) && url.hostname !== "";
  } catch {
    return false;
  }
}

export function pickProxyEnv(env: EnvMap): EnvMap {
  const result: EnvMap = {};
  for (const key of PROXY_ENV_KEYS) {
    if (env[key] !== undefined) {
      result[key] = env[key];
    }
  }
  return result;
}

/**
 * Resolve the proxy-related env assignments for the given settings.
 * `undefined` values mean the key should be deleted from the env.
 */
export function resolveProxyEnvAssignments(
  settings: NetworkProxySettings,
  systemSnapshot: EnvMap,
): EnvMap {
  const normalized = normalizeNetworkProxySettings(settings);

  if (normalized.mode === "system") {
    const assignments: EnvMap = {};
    for (const key of PROXY_ENV_KEYS) {
      assignments[key] = systemSnapshot[key];
    }
    return assignments;
  }

  if (normalized.mode === "off") {
    const assignments: EnvMap = {};
    for (const key of PROXY_ENV_KEYS) {
      assignments[key] = undefined;
    }
    return assignments;
  }

  const http = normalized.httpProxy;
  const https = normalized.httpsProxy || http;
  const all = normalized.allProxy;
  const noProxy = normalized.noProxy || DEFAULT_NO_PROXY;

  return {
    HTTP_PROXY: http || undefined,
    HTTPS_PROXY: https || undefined,
    ALL_PROXY: all || undefined,
    NO_PROXY: noProxy,
    FTP_PROXY: undefined,
    http_proxy: http || undefined,
    https_proxy: https || undefined,
    all_proxy: all || undefined,
    no_proxy: noProxy,
    ftp_proxy: undefined,
  };
}

/** Mutate `env` so proxy keys match the resolved assignments. */
export function assignProxyEnv(env: EnvMap, assignments: EnvMap): void {
  for (const [key, value] of Object.entries(assignments)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
}

/**
 * Apply app proxy settings to a process-like env map.
 * Also enables Node's env-based proxy for fetch / http / https
 * (`NODE_USE_ENV_PROXY=1`, Node 22.21+ / 24+).
 */
export function applyNetworkProxyToEnv(
  env: EnvMap,
  settings: NetworkProxySettings,
  systemSnapshot: EnvMap,
): void {
  assignProxyEnv(env, resolveProxyEnvAssignments(settings, systemSnapshot));
  env.NODE_USE_ENV_PROXY = "1";
}

/**
 * Credentials Chromium should answer a proxy auth challenge with. Chromium
 * cannot read userinfo out of `proxyRules`, so the main process replays these
 * through the `login` event. HTTPS wins over HTTP wins over ALL_PROXY, matching
 * the precedence Chromium uses when picking the proxy in the first place.
 */
export function getManualProxyCredentials(
  settings: NetworkProxySettings,
): { username: string; password: string } | null {
  const normalized = normalizeNetworkProxySettings(settings);
  if (normalized.mode !== "manual") {
    return null;
  }
  for (const url of [
    normalized.httpsProxy,
    normalized.httpProxy,
    normalized.allProxy,
  ]) {
    const credentials = extractProxyCredentials(url);
    if (credentials) {
      return credentials;
    }
  }
  return null;
}

/** True when manual mode is selected but no proxy URL was actually entered. */
export function isManualProxyIncomplete(
  settings: NetworkProxySettings,
): boolean {
  const normalized = normalizeNetworkProxySettings(settings);
  return (
    normalized.mode === "manual" &&
    !normalized.httpProxy &&
    !normalized.httpsProxy &&
    !normalized.allProxy
  );
}

export interface ElectronProxyConfig {
  mode: "direct" | "system" | "fixed_servers";
  proxyRules?: string;
  proxyBypassRules?: string;
}

/**
 * Map app proxy settings to Electron `session.setProxy` options.
 * Manual mode builds fixed_servers rules from http/https proxy URLs.
 */
export function buildElectronProxyConfig(
  settings: NetworkProxySettings,
): ElectronProxyConfig {
  const normalized = normalizeNetworkProxySettings(settings);

  if (normalized.mode === "off") {
    return { mode: "direct" };
  }

  if (normalized.mode === "system") {
    return { mode: "system" };
  }

  const http = normalized.httpProxy;
  const https = normalized.httpsProxy || http;
  const parts: string[] = [];

  if (http) {
    parts.push(`http=${toElectronProxyServer(http)}`);
  }
  if (https) {
    parts.push(`https=${toElectronProxyServer(https)}`);
  }
  // Electron fixed_servers does not use ALL_PROXY the same way CLIs do;
  // when only allProxy is set, treat it as the catch-all proxyRules value.
  if (parts.length === 0 && normalized.allProxy) {
    return {
      mode: "fixed_servers",
      proxyRules: toElectronProxyServer(normalized.allProxy),
      proxyBypassRules: normalized.noProxy || DEFAULT_NO_PROXY,
    };
  }

  if (parts.length === 0) {
    return { mode: "direct" };
  }

  return {
    mode: "fixed_servers",
    proxyRules: parts.join(";"),
    proxyBypassRules: normalized.noProxy || DEFAULT_NO_PROXY,
  };
}

/**
 * Build one `proxyURL` token for Chromium's `proxyRules` grammar:
 *
 *   proxyURL = [<proxyScheme>"://"]<proxyHost>[":"<proxyPort>]
 *
 * Two consequences drive this function:
 * - The scheme must be kept for anything but plain HTTP, otherwise Chromium
 *   applies its `http` default and dials a SOCKS port as if it were an HTTP
 *   proxy. `socks5h` is a curl-ism Chromium does not know; it maps to `socks5`
 *   (Chromium always resolves DNS proxy-side for SOCKS5 anyway).
 * - The grammar has no userinfo slot, so credentials are dropped here. Chromium
 *   asks for proxy credentials through the `login` event instead; see the main
 *   process proxy service.
 *
 * https://www.electronjs.org/docs/latest/api/structures/proxy-config
 */
function toElectronProxyServer(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    const port = url.port ? `:${url.port}` : "";
    const scheme = url.protocol === "socks5h:" ? "socks5:" : url.protocol;
    const prefix = scheme === "http:" ? "" : `${scheme}//`;
    return `${prefix}${url.hostname}${port}`;
  } catch {
    return proxyUrl;
  }
}

/** Credentials for a proxy URL, if it carries any. */
export function extractProxyCredentials(
  proxyUrl: string,
): { username: string; password: string } | null {
  try {
    const url = new URL(proxyUrl);
    if (!url.username) {
      return null;
    }
    return {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return null;
  }
}

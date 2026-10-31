import {
  createSavedHostStore,
  type FetchLike,
  HostAccessError,
  type KeyValueStorage,
  pairHost,
  type SavedHost,
  type SavedHostStore,
  verifyHostCredential,
} from "@cocurdex/client-runtime";
import type { DaemonConnectionInfo } from "@cocurdex/rpc";
import { HOST_PAIRING_LINK_PARAM } from "@cocurdex/shared";
import { offlineApi } from "./offline-api";
import type { HostBridge, HostCapabilities } from "./types";

const TOKEN_STORAGE_KEY = "cocurdex.daemonToken";
const AUDIENCE_WINDOW_NAME = "cocurdex-deck-audience";
let audienceWindow: Window | null = null;
let audienceChannel: string | null = null;
const DAEMON_URL_STORAGE_KEY = "cocurdex.daemonUrl";
const DAEMON_URL_FRAGMENT_KEY = "daemon";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type WebPairingReason =
  | "missing"
  | "invalid"
  | "rateLimited"
  | "unreachable";

export type WebHostAccess =
  | { kind: "local"; connection: DaemonConnectionInfo }
  | { kind: "device"; connection: DaemonConnectionInfo; host: SavedHost }
  | { kind: "needsPairing"; reason: WebPairingReason };

export interface WebLocation {
  readonly hash: string;
  readonly host: string;
  readonly origin: string;
  readonly protocol: string;
}

export interface WebHostAccessDeps {
  sessionStore: KeyValueStorage | null;
  savedHosts: SavedHostStore;
  fetch?: FetchLike;
  localDaemonUrl?: string | null;
}

function readFragment(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function nonEmpty(value: string | null | undefined) {
  return value && value.length > 0 ? value : null;
}

function webSocketUrlFor(location: WebLocation) {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}`;
}

function failureReason(error: unknown): WebPairingReason {
  return error instanceof HostAccessError ? error.reason : "unreachable";
}

function readStoredToken(store: KeyValueStorage | null) {
  try {
    return nonEmpty(store?.getItem(TOKEN_STORAGE_KEY));
  } catch {
    return null;
  }
}

function localAccess(
  location: WebLocation,
  token: string,
  daemonUrl: string | null | undefined,
): WebHostAccess {
  return {
    kind: "local",
    connection: { token, webSocketUrl: daemonUrl ?? webSocketUrlFor(location) },
  };
}

function loopbackDaemonUrl(value: string | null | undefined) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return null;
  return `${url.protocol}//${url.host}`;
}

export function resolveDevDaemonUrl(
  hash: string,
  store: KeyValueStorage | null,
) {
  const offered = loopbackDaemonUrl(
    readFragment(hash).get(DAEMON_URL_FRAGMENT_KEY),
  );
  try {
    if (!offered)
      return loopbackDaemonUrl(store?.getItem(DAEMON_URL_STORAGE_KEY));
    store?.setItem(DAEMON_URL_STORAGE_KEY, offered);
  } catch {}
  return offered;
}

export function buildDevWebClientUrl(
  pageOrigin: string,
  connection: DaemonConnectionInfo,
) {
  const url = new URL("/", pageOrigin);
  url.hash = new URLSearchParams({
    token: connection.token,
    [DAEMON_URL_FRAGMENT_KEY]: connection.webSocketUrl,
  }).toString();
  return url.toString();
}

function deviceAccess(location: WebLocation, host: SavedHost): WebHostAccess {
  return {
    kind: "device",
    host,
    connection: { token: host.token, webSocketUrl: webSocketUrlFor(location) },
  };
}

async function tryPairing(
  location: WebLocation,
  code: string,
  deps: WebHostAccessDeps,
) {
  try {
    const host = await pairHost({
      baseUrl: location.origin,
      code,
      store: deps.savedHosts,
      fetch: deps.fetch,
    });
    return { host, failure: null };
  } catch (error) {
    return { host: null, failure: failureReason(error) };
  }
}

export async function resolveWebHostAccess(
  location: WebLocation,
  deps: WebHostAccessDeps,
): Promise<WebHostAccess> {
  const fragment = readFragment(location.hash);
  const localToken = nonEmpty(fragment.get("token"));
  if (localToken) {
    try {
      deps.sessionStore?.setItem(TOKEN_STORAGE_KEY, localToken);
    } catch {}
    return localAccess(location, localToken, deps.localDaemonUrl);
  }

  const code = nonEmpty(fragment.get(HOST_PAIRING_LINK_PARAM));
  const pairing = code ? await tryPairing(location, code, deps) : null;
  if (pairing?.host) return deviceAccess(location, pairing.host);

  const saved = deps.savedHosts.findByBaseUrl(location.origin);
  if (saved) {
    try {
      await verifyHostCredential({
        baseUrl: location.origin,
        token: saved.token,
        fetch: deps.fetch,
      });
    } catch (error) {
      if (failureReason(error) === "invalid") {
        deps.savedHosts.remove(saved.hostId);
        return { kind: "needsPairing", reason: "invalid" };
      }
    }
    return deviceAccess(location, saved);
  }

  const storedToken = readStoredToken(deps.sessionStore);
  if (storedToken && !pairing) {
    return localAccess(location, storedToken, deps.localDaemonUrl);
  }
  return { kind: "needsPairing", reason: pairing?.failure ?? "missing" };
}

function safeStore(read: () => KeyValueStorage): KeyValueStorage | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function savedHostStore() {
  return createSavedHostStore(safeStore(() => window.localStorage));
}

function snapshotLocation(): WebLocation {
  const { hash, host, origin, protocol } = window.location;
  return { hash, host, origin, protocol };
}

function dropFragmentCredentials() {
  const fragment = readFragment(window.location.hash);
  if (!fragment.has("token") && !fragment.has(HOST_PAIRING_LINK_PARAM)) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search);
}

function createConnectionResolver(
  access: Promise<WebHostAccess>,
  savedHosts: SavedHostStore,
) {
  let verified = false;
  return async (): Promise<DaemonConnectionInfo | null> => {
    const resolved = await access;
    if (resolved.kind === "needsPairing") return null;
    if (resolved.kind === "local" || !verified) {
      verified = true;
      return resolved.connection;
    }
    try {
      await verifyHostCredential({
        baseUrl: resolved.host.baseUrl,
        token: resolved.host.token,
      });
    } catch (error) {
      if (failureReason(error) === "invalid") {
        savedHosts.remove(resolved.host.hostId);
        window.location.reload();
        return null;
      }
    }
    return resolved.connection;
  };
}

export async function pairThisBrowser(code: string) {
  await pairHost({
    baseUrl: window.location.origin,
    code: code.trim(),
    store: savedHostStore(),
  });
}

export function webPairingFailureReason(error: unknown) {
  return failureReason(error);
}

export function webHostCapabilities(access: WebHostAccess): HostCapabilities {
  const local = access.kind === "local";
  const terminal =
    local ||
    (access.kind === "device" && access.host.scopes.includes("execute"));
  return {
    fileManager: local,
    nativeDirectoryDialog: false,
    terminal,
    browserView: false,
    localWebClient: false,
    localFilePaths: false,
  };
}

export function installWebHostBridge(): Promise<WebHostAccess> | null {
  if (window.desktopApi) return null;
  const savedHosts = savedHostStore();
  const location = snapshotLocation();
  const sessionStore = safeStore(() => window.sessionStorage);
  const access = resolveWebHostAccess(location, {
    sessionStore,
    savedHosts,
    localDaemonUrl: import.meta.env.DEV
      ? resolveDevDaemonUrl(location.hash, sessionStore)
      : null,
  });
  dropFragmentCredentials();
  const bridge: HostBridge = {
    ...offlineApi,
    capabilities: {
      fileManager: false,
      nativeDirectoryDialog: false,
      terminal: false,
      browserView: false,
      localWebClient: false,
      localFilePaths: false,
    },
    getDaemonConnection: createConnectionResolver(access, savedHosts),
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    downloadUrl: async (url) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "";
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
    openPresentationWindow: async ({ channel }) => {
      const url = new URL(window.location.pathname, window.location.origin);
      url.searchParams.set("window", "deck-audience");
      url.searchParams.set("channel", channel);
      audienceWindow = window.open(url, AUDIENCE_WINDOW_NAME, "popup");
      audienceChannel = channel;
      return { opened: audienceWindow !== null, externalDisplay: false };
    },
    closePresentationWindow: async ({ channel }) => {
      if (audienceChannel !== channel) return;
      audienceWindow?.close();
      audienceWindow = null;
      audienceChannel = null;
    },
  };
  window.desktopApi = bridge;
  return access.then((resolved) => {
    window.desktopApi = {
      ...bridge,
      capabilities: webHostCapabilities(resolved),
    };
    return resolved;
  });
}

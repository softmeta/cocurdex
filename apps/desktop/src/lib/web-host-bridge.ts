import type { KeyValueStorage } from "@cocurdex/client-runtime";
import type { DaemonConnectionInfo } from "@cocurdex/rpc";
import { offlineApi } from "./offline-api";
import type { HostBridge, HostCapabilities } from "./types";

const TOKEN_STORAGE_KEY = "cocurdex.daemonToken";
const AUDIENCE_WINDOW_NAME = "cocurdex-deck-audience";
let audienceWindow: Window | null = null;
let audienceChannel: string | null = null;
const DAEMON_URL_STORAGE_KEY = "cocurdex.daemonUrl";
const DAEMON_URL_FRAGMENT_KEY = "daemon";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type WebHostAccess =
  | { kind: "local"; connection: DaemonConnectionInfo }
  | { kind: "unlinked" };

export interface WebLocation {
  readonly hash: string;
  readonly host: string;
  readonly origin: string;
  readonly protocol: string;
}

export interface WebHostAccessDeps {
  sessionStore: KeyValueStorage | null;
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

export function resolveWebHostAccess(
  location: WebLocation,
  deps: WebHostAccessDeps,
): WebHostAccess {
  const fragment = readFragment(location.hash);
  const localToken = nonEmpty(fragment.get("token"));
  if (localToken) {
    try {
      deps.sessionStore?.setItem(TOKEN_STORAGE_KEY, localToken);
    } catch {}
    return localAccess(location, localToken, deps.localDaemonUrl);
  }

  const storedToken = readStoredToken(deps.sessionStore);
  if (storedToken) {
    return localAccess(location, storedToken, deps.localDaemonUrl);
  }
  return { kind: "unlinked" };
}

function safeStore(read: () => KeyValueStorage): KeyValueStorage | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function snapshotLocation(): WebLocation {
  const { hash, host, origin, protocol } = window.location;
  return { hash, host, origin, protocol };
}

function dropFragmentCredentials() {
  const fragment = readFragment(window.location.hash);
  if (!fragment.has("token")) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search);
}

export function webHostCapabilities(access: WebHostAccess): HostCapabilities {
  const local = access.kind === "local";
  return {
    fileManager: local,
    nativeDirectoryDialog: false,
    terminal: local,
    browserView: false,
    localWebClient: false,
    localFilePaths: false,
  };
}

export function installWebHostBridge(): WebHostAccess | null {
  if (window.desktopApi) return null;
  const location = snapshotLocation();
  const sessionStore = safeStore(() => window.sessionStorage);
  const access = resolveWebHostAccess(location, {
    sessionStore,
    localDaemonUrl: import.meta.env.DEV
      ? resolveDevDaemonUrl(location.hash, sessionStore)
      : null,
  });
  dropFragmentCredentials();
  const bridge: HostBridge = {
    ...offlineApi,
    capabilities: webHostCapabilities(access),
    getDaemonConnection: async () =>
      access.kind === "local" ? access.connection : null,
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
  return access;
}

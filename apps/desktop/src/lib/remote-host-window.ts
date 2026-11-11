import type { RemoteHostRecord } from "@cocurdex/shared";
import { getHostBridge, overrideHostBridge } from "./host-bridge";
import { offlineHostApi } from "./offline-api";
import type { HostCapabilities } from "./types";

const REMOTE_HOST_PARAM = "remoteHost";

export function isRemoteHostWindow() {
  return new URLSearchParams(window.location.search).has(REMOTE_HOST_PARAM);
}

export function remoteHostCapabilities(
  scopes: HostCapabilities["scopes"],
): HostCapabilities {
  return {
    fileManager: false,
    nativeDirectoryDialog: false,
    terminal: scopes?.includes("execute") ?? false,
    browserView: false,
    localWebClient: false,
    localFilePaths: false,
    localDaemonControl: false,
    windowMaterial: false,
    remoteHostWindows: false,
    scopes,
  };
}

let connectedRemoteHost: RemoteHostRecord | null = null;

export function remoteWindowHost() {
  return connectedRemoteHost;
}

export async function connectRemoteHostWindow() {
  const bridge = getHostBridge();
  const target = await bridge?.getRemoteHostWindow().catch(() => null);
  if (!bridge || !target) return null;
  connectedRemoteHost = target.host;
  overrideHostBridge({
    ...bridge,
    chatWindow: offlineHostApi.chatWindow,
    capabilities: remoteHostCapabilities(target.host.scopes),
    pairedHost: target.endpoint,
    getDaemonConnection: async () => null,
    openWorkspace: async () => ({ canceled: true, filePaths: [] }),
    consumePendingOpenFolder: async () => null,
    onOpenWorkspaceFromCli: () => () => {},
    openRemoteHostWindow: offlineHostApi.openRemoteHostWindow,
  });
  document.title = target.host.name;
  return target.host;
}

export function hasChatWindows() {
  const chatWindow = getHostBridge()?.chatWindow;
  return chatWindow !== undefined && chatWindow !== offlineHostApi.chatWindow;
}

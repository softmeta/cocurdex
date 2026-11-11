import { daemonEventApi } from "./daemon-events";
import { getHostBridge } from "./host-bridge";
import { offlineHostApi } from "./offline-api";
import { daemonProductApi } from "./product-api";
import type { DesktopApi, HostBridge } from "./types";

function composeDesktopApi(host: HostBridge): DesktopApi {
  return { ...host, ...daemonProductApi, ...daemonEventApi };
}

const offlineDesktopApi = composeDesktopApi(offlineHostApi);
let composed: { bridge: HostBridge; api: DesktopApi } | null = null;

function getDesktopApi(): DesktopApi {
  const bridge = getHostBridge();
  if (!bridge) {
    return offlineDesktopApi;
  }
  if (composed?.bridge !== bridge) {
    composed = { bridge, api: composeDesktopApi(bridge) };
  }
  return composed.api;
}

export const desktopApi = new Proxy(offlineDesktopApi, {
  get(_target, property, receiver) {
    const api = getDesktopApi();
    return Reflect.get(api, property, receiver);
  },
}) satisfies DesktopApi;

import { daemonEventApi } from "./daemon-events";
import { getHostBridge } from "./host-bridge";
import { offlineApi } from "./offline-api";
import { daemonProductApi } from "./product-api";
import type { DesktopApi, HostBridge } from "./types";

let composed: { bridge: HostBridge; api: DesktopApi } | null = null;

function getDesktopApi(): DesktopApi {
  const bridge = getHostBridge();
  if (!bridge) {
    return offlineApi;
  }
  if (composed?.bridge !== bridge) {
    composed = {
      bridge,
      api: { ...bridge, ...daemonProductApi, ...daemonEventApi },
    };
  }
  return composed.api;
}

export const desktopApi = new Proxy(offlineApi, {
  get(_target, property, receiver) {
    const api = getDesktopApi();
    return Reflect.get(api, property, receiver);
  },
}) satisfies DesktopApi;

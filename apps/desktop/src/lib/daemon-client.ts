import {
  createHostRegistry,
  type HostCommandOptions,
  type HostEventListener,
  type HostRegistry,
  type PlatformSignals,
} from "@cocurdex/client-runtime";
import type {
  DaemonMethod,
  DaemonRequestPayloadByMethod,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { DaemonRpcRequestOptions } from "@cocurdex/rpc/client";
import { getHostBridge } from "./host-bridge";

export const LOCAL_HOST_ID = "local";

let registry: HostRegistry | null = null;

export function getHostRegistry() {
  registry ??= createHostRegistry();
  return registry;
}

function browserSignals(): PlatformSignals {
  if (typeof window === "undefined") return {};
  return {
    network: {
      isOnline: () => navigator.onLine,
      subscribe(listener) {
        const online = () => listener(true);
        const offline = () => listener(false);
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        return () => {
          window.removeEventListener("online", online);
          window.removeEventListener("offline", offline);
        };
      },
    },
    lifecycle: {
      subscribeForeground(listener) {
        const visible = () => {
          if (document.visibilityState === "visible") listener();
        };
        document.addEventListener("visibilitychange", visible);
        return () => document.removeEventListener("visibilitychange", visible);
      },
    },
  };
}

export async function resolveLocalDaemonConnection() {
  const info = await getHostBridge()?.getDaemonConnection();
  if (!info) throw new Error("The Cocurdex daemon is unavailable");
  return info;
}

export function getLocalHost() {
  return getHostRegistry().register({
    hostId: LOCAL_HOST_ID,
    platform: {
      ...browserSignals(),
      resolveEndpoint: resolveLocalDaemonConnection,
    },
  });
}

export function requestDaemon<M extends DaemonMethod>(
  method: M,
  params?: DaemonRequestPayloadByMethod[M],
  options?: DaemonRpcRequestOptions,
): Promise<DaemonResultByMethod[M]> {
  return getLocalHost().request(method, params, options);
}

export function commandDaemon<M extends DaemonMethod>(
  method: M,
  params: DaemonRequestPayloadByMethod[M],
  options: HostCommandOptions,
): Promise<DaemonResultByMethod[M]> {
  return getLocalHost().command(method, params, options);
}

export function onLocalHostEvent(listener: HostEventListener) {
  return getLocalHost().onEvent(listener);
}

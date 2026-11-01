import {
  createHostRegistry,
  type HostCommandOptions,
  type HostEndpoint,
  type HostEventListener,
  type HostReadOptions,
  type HostRegistry,
  type PairedHostEndpoint,
  type PlatformSignals,
} from "@cocurdex/client-runtime";
import type {
  DaemonMethod,
  DaemonRequestPayloadByMethod,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type {
  DaemonRpcRequestOptions,
  DaemonTransport,
  DaemonTransportConnection,
} from "@cocurdex/rpc/client";
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

function pairedTransport(endpoint: PairedHostEndpoint): DaemonTransport {
  return (handlers) => {
    const pending: string[] = [];
    let connection: DaemonTransportConnection | null = null;
    let closed = false;
    import("@cocurdex/client-runtime/secure-transport").then(
      ({ createSecureHostTransport }) => {
        if (closed) return;
        connection = createSecureHostTransport(endpoint)(handlers);
        for (const message of pending.splice(0)) connection.send(message);
      },
      (error: unknown) => {
        handlers.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
        handlers.onClose();
      },
    );
    return {
      send(message) {
        if (connection) connection.send(message);
        else pending.push(message);
      },
      close() {
        closed = true;
        connection?.close();
      },
    };
  };
}

export async function resolveLocalDaemonConnection() {
  const info = await getHostBridge()?.getDaemonConnection();
  if (!info) throw new Error("The Cocurdex daemon is unavailable");
  return info;
}

async function resolveHostEndpoint(): Promise<HostEndpoint> {
  return getHostBridge()?.pairedHost ?? resolveLocalDaemonConnection();
}

export function getLocalHost() {
  return getHostRegistry().register({
    hostId: LOCAL_HOST_ID,
    platform: {
      ...browserSignals(),
      resolveEndpoint: resolveHostEndpoint,
      openPairedTransport: pairedTransport,
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

export function readDaemon<M extends DaemonMethod>(
  method: M,
  params?: DaemonRequestPayloadByMethod[M],
  options?: HostReadOptions,
): Promise<DaemonResultByMethod[M]> {
  return getLocalHost().read(method, params, options);
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

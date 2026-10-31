import {
  createHostRegistry,
  findReachableOrigin,
  foregroundWakeup,
  type HostConnection,
  type LifecycleSignal,
  type NetworkSignal,
  savedHostEndpoint,
  savedHostOrigins,
} from "@cocurdex/client-runtime";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { AppState } from "react-native";
import { hosts, mobileNoiseCrypto } from "@/hosts";

const lifecycle: LifecycleSignal = {
  subscribeForeground(listener) {
    let backgroundedAt =
      AppState.currentState === "background" ? Date.now() : null;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (state !== "active") return;
      listener(foregroundWakeup(backgroundedAt, Date.now()));
      backgroundedAt = null;
    });
    return () => subscription.remove();
  },
};

let connected: boolean | undefined;
const networkListeners = new Set<(online: boolean) => void>();

function updateConnected(next: boolean | undefined) {
  if (next === undefined || next === connected) return;
  connected = next;
  for (const listener of networkListeners) listener(next);
}

addNetworkStateListener((event) => updateConnected(event.isConnected));
void getNetworkStateAsync()
  .then((event) => {
    if (connected === undefined) updateConnected(event.isConnected);
  })
  .catch(() => undefined);

const network: NetworkSignal = {
  isOnline: () => connected !== false,
  subscribe(listener) {
    networkListeners.add(listener);
    return () => networkListeners.delete(listener);
  },
};

const registry = createHostRegistry();

function pairedHost(hostId: string) {
  const host = hosts.getSnapshot().find((saved) => saved.hostId === hostId);
  if (!host) throw new Error("This computer is no longer paired");
  return host;
}

async function resolveHostEndpoint(hostId: string) {
  const host = pairedHost(hostId);
  if (savedHostOrigins(host).length > 1) {
    const reachable = await findReachableOrigin({
      host,
      crypto: mobileNoiseCrypto,
    });
    if (reachable) hosts.switchOrigin(hostId, reachable.origin);
  }
  return savedHostEndpoint(pairedHost(hostId));
}

function adoptReportedSession(connection: HostConnection) {
  let wasLive = false;
  connection.subscribeState((state) => {
    const live = state.status === "live";
    const becameLive = live && !wasLive;
    wasLive = live;
    if (!becameLive) return;
    void connection
      .request("host.session", undefined)
      .then(({ principal, endpoints }) => {
        hosts.adoptSession(connection.hostId, {
          scopes: principal.kind === "device" ? principal.scopes : undefined,
          endpoints,
        });
      })
      .catch(() => undefined);
  });
  return connection;
}

export function hostConnection(hostId: string): HostConnection {
  return (
    registry.get(hostId) ??
    adoptReportedSession(
      registry.register({
        hostId,
        platform: {
          lifecycle,
          network,
          noiseCrypto: mobileNoiseCrypto,
          resolveEndpoint: () => resolveHostEndpoint(hostId),
        },
      }),
    )
  );
}

export const onHostConnectionRemoved = registry.onHostRemoved;

hosts.subscribe(() => {
  const paired = new Set(hosts.getSnapshot().map((host) => host.hostId));
  for (const connection of registry.list()) {
    if (!paired.has(connection.hostId)) registry.remove(connection.hostId);
  }
});

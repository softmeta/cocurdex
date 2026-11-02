import {
  connectReachableOrigin,
  createHostRegistry,
  createSecureTransport,
  findDirectOrigin,
  foregroundWakeup,
  HostAccessError,
  type HostConnection,
  type LifecycleSignal,
  type NetworkSignal,
  type SecureSocketHandlers,
  savedHostEndpoint,
} from "@cocurdex/client-runtime";
import { isRelayEndpoint } from "@cocurdex/shared";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { AppState } from "react-native";
import { hosts, mobileMessageCompressor, mobileNoiseCrypto } from "@/hosts";
import { mirrorPushKeys, pushRegistrar } from "@/notifications";

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

let networkType: string | undefined;
const networkTypeListeners = new Set<() => void>();

function updateNetworkType(next: string | undefined) {
  if (next === undefined || next === networkType) return;
  const changed = networkType !== undefined;
  networkType = next;
  if (!changed) return;
  for (const listener of networkTypeListeners) listener();
}

addNetworkStateListener((event) => {
  updateConnected(event.isConnected);
  updateNetworkType(event.type);
});
void getNetworkStateAsync()
  .then((event) => {
    if (connected === undefined) updateConnected(event.isConnected);
    if (networkType === undefined) networkType = event.type;
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

const connectedOrigins = new Map<string, string>();

async function connectHost(hostId: string, handlers: SecureSocketHandlers) {
  const host = pairedHost(hostId);
  const connected = await connectReachableOrigin({
    host,
    crypto: mobileNoiseCrypto,
    compressor: mobileMessageCompressor,
    handlers,
    onDirectFound: (origin) => hosts.switchOrigin(hostId, origin),
  });
  if (!connected) {
    throw new HostAccessError("unreachable", "No address of the host answered");
  }
  connectedOrigins.set(hostId, connected.origin);
  if (connected.origin !== host.baseUrl) {
    hosts.switchOrigin(hostId, connected.origin);
  }
  return connected.opened;
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
    void pushRegistrar
      .hostLive(connection.hostId, (registration) =>
        connection.request("host.push.register", registration),
      )
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
        filterSessionEvents: true,
        platform: {
          lifecycle,
          network,
          openPairedTransport: () =>
            createSecureTransport((handlers) => connectHost(hostId, handlers)),
          resolveEndpoint: async () => savedHostEndpoint(pairedHost(hostId)),
        },
      }),
    )
  );
}

export const onHostConnectionRemoved = registry.onHostRemoved;

async function preferDirectPath(connection: HostConnection) {
  if (connection.getState().status !== "live") return;
  const host = hosts
    .getSnapshot()
    .find((saved) => saved.hostId === connection.hostId);
  const origin = connectedOrigins.get(connection.hostId);
  if (!host || origin === undefined || !isRelayEndpoint(origin)) return;
  const direct = await findDirectOrigin({ host, crypto: mobileNoiseCrypto });
  if (!direct || connection.getState().status !== "live") return;
  hosts.switchOrigin(host.hostId, direct);
  connection.wake("reconnect");
}

function preferDirectPaths() {
  for (const connection of registry.list()) void preferDirectPath(connection);
}

networkTypeListeners.add(preferDirectPaths);
AppState.addEventListener("change", (state) => {
  if (state === "active") preferDirectPaths();
});

function syncPairedHosts() {
  const saved = hosts.getSnapshot();
  const paired = new Set(saved.map((host) => host.hostId));
  for (const connection of registry.list()) {
    if (paired.has(connection.hostId)) continue;
    registry.remove(connection.hostId);
    connectedOrigins.delete(connection.hostId);
    pushRegistrar.hostRemoved(connection.hostId);
  }
  mirrorPushKeys(saved);
}

mirrorPushKeys(hosts.getSnapshot());
hosts.subscribe(syncPairedHosts);

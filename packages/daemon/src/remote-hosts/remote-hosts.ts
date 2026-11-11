import {
  type ConnectedOrigin,
  connectReachableOrigin,
  createSecureTransport,
  HostAccessError,
  type PairHostOptions,
  pairHost,
  type SavedHost,
  type SavedHostStore,
  savedHostEndpoint,
  savedHostSafetyCode,
} from "@cocurdex/client-runtime";
import type {
  DaemonMethod,
  DaemonRequestPayloadByMethod,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import {
  createDaemonRpcClient,
  createSharedTransport,
  DaemonClientError,
  type DaemonRpcClient,
} from "@cocurdex/rpc/client";
import type { NoiseCrypto } from "@cocurdex/secure-channel";
import {
  type HostAccessScope,
  parseHostPairingLink,
  type RemoteHostEndpoint,
  type RemoteHostPairing,
  type RemoteHostPairPayload,
  type RemoteHostRecord,
  type RemoteHostStatus,
} from "@cocurdex/shared";

export const REMOTE_WORK_SCOPES: readonly HostAccessScope[] = [
  "read",
  "interact",
  "execute",
];

export interface RemoteHostClient {
  rpc: DaemonRpcClient;
  close(): void;
}

export interface RemoteHostsOptions {
  store: SavedHostStore;
  crypto: NoiseCrypto;
  deviceLabel(): string;
  pair?(options: PairHostOptions): Promise<SavedHost>;
  openClient?(host: SavedHost): RemoteHostClient;
}

interface HostHealth {
  status: RemoteHostStatus;
  error: string | null;
}

const UNKNOWN: HostHealth = { status: "unknown", error: null };

function failureStatus(error: unknown): RemoteHostStatus {
  const code = error instanceof DaemonClientError ? error.code : null;
  if (code === "PENDING_APPROVAL") return "pending";
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return "rejected";
  return "offline";
}

function isTransportFailure(error: unknown) {
  if (!(error instanceof DaemonClientError)) return false;
  return [
    "PENDING_APPROVAL",
    "UNAUTHORIZED",
    "UNAVAILABLE",
    "TRANSPORT_ERROR",
    "DISCONNECTED",
    "TIMEOUT",
  ].includes(error.code ?? "");
}

function pairTarget(payload: RemoteHostPairPayload) {
  if ("link" in payload) {
    const parsed = parseHostPairingLink(payload.link);
    if (!parsed) throw new Error("That is not a Cocurdex pairing link.");
    return parsed;
  }
  return {
    baseUrl: payload.baseUrl,
    code: payload.code,
    hostKey: payload.hostKey,
  };
}

function openSecureClient(
  host: SavedHost,
  crypto: NoiseCrypto,
): RemoteHostClient {
  const sockets = new Set<() => void>();
  const transport = createSharedTransport(
    createSecureTransport(async (handlers) => {
      let connected: ConnectedOrigin | null = null;
      connected = await connectReachableOrigin({
        host,
        crypto,
        handlers: {
          ...handlers,
          onClose() {
            if (connected) sockets.delete(connected.opened.close);
            handlers.onClose();
          },
        },
      });
      if (!connected) {
        throw new HostAccessError("offline", `${host.name} is not reachable`);
      }
      sockets.add(connected.opened.close);
      return connected.opened;
    }),
  );
  return {
    rpc: createDaemonRpcClient(transport, ""),
    close() {
      for (const close of sockets) close();
      sockets.clear();
    },
  };
}

const REPROBE_INTERVAL_MS = 3_000;

export class RemoteHosts {
  private readonly clients = new Map<string, RemoteHostClient>();
  private readonly health = new Map<string, HostHealth>();
  private readonly listeners = new Set<() => void>();
  private readonly probedAt = new Map<string, number>();

  constructor(private readonly options: RemoteHostsOptions) {}

  list(): RemoteHostRecord[] {
    const hosts = this.options.store.list();
    for (const host of hosts) this.reprobeUnconnected(host.hostId);
    return hosts.map((host) => this.describe(host));
  }

  find(hostId: string) {
    return (
      this.options.store.list().find((host) => host.hostId === hostId) ?? null
    );
  }

  require(hostId: string) {
    const host = this.find(hostId);
    if (!host) throw new Error("No paired computer has this id.");
    return host;
  }

  async pair(payload: RemoteHostPairPayload): Promise<RemoteHostPairing> {
    const target = pairTarget(payload);
    const label = payload.label?.trim() || this.options.deviceLabel();
    const pair = this.options.pair ?? pairHost;
    const saved = await pair({
      ...target,
      label,
      store: this.options.store,
      crypto: this.options.crypto,
    });
    if (!this.find(saved.hostId)) {
      throw new Error("Could not save the paired computer.");
    }
    this.dropClient(saved.hostId);
    this.health.set(saved.hostId, UNKNOWN);
    await this.probe(saved.hostId);
    this.notify();
    return {
      host: this.describe(saved),
      missingScopes: REMOTE_WORK_SCOPES.filter(
        (scope) => !saved.scopes.includes(scope),
      ),
    };
  }

  async remove(hostId: string) {
    if (!this.find(hostId)) return false;
    await this.request(hostId, "host.devices.revokeSelf", undefined, {
      timeoutMs: 5_000,
    }).catch(() => undefined);
    this.dropClient(hostId);
    this.health.delete(hostId);
    this.probedAt.delete(hostId);
    this.options.store.remove(hostId);
    this.notify();
    return true;
  }

  endpoint(hostId: string): RemoteHostEndpoint {
    return savedHostEndpoint(this.require(hostId));
  }

  status(hostId: string): HostHealth {
    return this.health.get(hostId) ?? UNKNOWN;
  }

  async probe(hostId: string) {
    await this.request(hostId, "host.session", undefined, {
      timeoutMs: 10_000,
    }).catch(() => undefined);
    return this.status(hostId);
  }

  async request<M extends DaemonMethod>(
    hostId: string,
    method: M,
    params: DaemonRequestPayloadByMethod[M] | undefined,
    options?: { timeoutMs?: number },
  ): Promise<DaemonResultByMethod[M]> {
    const host = this.require(hostId);
    try {
      const result = await this.client(host).rpc.request(
        method,
        params,
        options,
      );
      this.setHealth(hostId, { status: "connected", error: null });
      return result;
    } catch (error) {
      if (isTransportFailure(error)) {
        this.dropClient(hostId);
        this.setHealth(hostId, {
          status: failureStatus(error),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  onChanged(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    for (const hostId of [...this.clients.keys()]) this.dropClient(hostId);
    this.listeners.clear();
  }

  private client(host: SavedHost) {
    let client = this.clients.get(host.hostId);
    if (!client) {
      client =
        this.options.openClient?.(host) ??
        openSecureClient(host, this.options.crypto);
      this.clients.set(host.hostId, client);
    }
    return client;
  }

  private reprobeUnconnected(hostId: string) {
    const { status } = this.status(hostId);
    if (status === "connected" || status === "rejected") return;
    const now = Date.now();
    if (now - (this.probedAt.get(hostId) ?? 0) < REPROBE_INTERVAL_MS) return;
    this.probedAt.set(hostId, now);
    void this.probe(hostId);
  }

  private dropClient(hostId: string) {
    this.clients.get(hostId)?.close();
    this.clients.delete(hostId);
  }

  private setHealth(hostId: string, next: HostHealth) {
    const previous = this.status(hostId);
    this.health.set(hostId, next);
    if (previous.status !== next.status) this.notify();
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }

  private describe(host: SavedHost): RemoteHostRecord {
    const health = this.status(host.hostId);
    return {
      hostId: host.hostId,
      name: host.name,
      baseUrl: host.baseUrl,
      deviceId: host.deviceId,
      scopes: host.scopes,
      pairedAt: host.pairedAt,
      safetyCode: savedHostSafetyCode(host, this.options.crypto),
      status: health.status,
      error: health.error,
    };
  }
}

export function remoteWorkGateway(hosts: RemoteHosts) {
  return {
    hosts: () =>
      hosts.list().map((host) => ({
        hostId: host.hostId,
        name: host.name,
        status: host.status,
      })),
    catalog: (hostId: string) =>
      hosts.request(hostId, "delegation.remote.catalog", undefined),
    start: (
      hostId: string,
      payload: DaemonRequestPayloadByMethod["delegation.remote.start"],
    ) => hosts.request(hostId, "delegation.remote.start", payload),
    status: (hostId: string, sessionIds: string[]) =>
      hosts.request(hostId, "delegation.remote.status", { sessionIds }),
    send: (
      hostId: string,
      payload: DaemonRequestPayloadByMethod["delegation.remote.send"],
    ) => hosts.request(hostId, "delegation.remote.send", payload),
    stop: (hostId: string, target: { sessionId: string }) =>
      hosts.request(hostId, "delegation.remote.stop", target),
    isUnreachable: isTransportFailure,
  };
}

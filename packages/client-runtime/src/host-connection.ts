import type {
  DaemonMethod,
  DaemonRequestPayloadByMethod,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import {
  createDaemonRpcClient,
  createSharedTransport,
  createWebSocketTransport,
  DaemonClientError,
  type DaemonRpcClient,
  type DaemonRpcRequestOptions,
  type DaemonTransport,
  daemonWebSocketProtocols,
} from "@cocurdex/rpc/client";
import type { CocurdexDaemonEvent, DaemonEventMeta } from "@cocurdex/shared";
import type { HostEndpoint, HostPlatform } from "./platform";
import {
  type ConnectionState,
  type ConnectionSupervisorOptions,
  createConnectionSupervisor,
} from "./supervisor";

export type HostEventListener = (
  event: CocurdexDaemonEvent,
  meta: DaemonEventMeta,
) => void;

export interface HostCommandOptions extends DaemonRpcRequestOptions {
  idempotencyKey: string;
  maxAttempts?: number;
}

export interface HostConnectionOptions {
  hostId: string;
  platform: HostPlatform;
  supervisor?: Pick<
    ConnectionSupervisorOptions,
    "backoff" | "stableAfterMs" | "now"
  >;
}

const CONNECTION_LOSS_CODES = new Set([
  "UNAVAILABLE",
  "DISCONNECTED",
  "TRANSPORT_ERROR",
  "TIMEOUT",
]);
const DEFAULT_COMMAND_ATTEMPTS = 5;
const unknownPosition: DaemonEventMeta = { epoch: null, seq: null };

export function isConnectionLoss(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && CONNECTION_LOSS_CODES.has(code);
}

const unsupportedPairedTransport: DaemonTransport = (handlers) => {
  queueMicrotask(() =>
    handlers.onError(
      new DaemonClientError(
        "This client cannot reach paired hosts",
        "UNAVAILABLE",
      ),
    ),
  );
  return { send: () => {}, close: () => {} };
};

function defaultTransport(
  endpoint: HostEndpoint,
  platform: HostPlatform,
): DaemonTransport {
  if (endpoint.kind === "paired") {
    return (
      platform.openPairedTransport?.(endpoint) ?? unsupportedPairedTransport
    );
  }
  return createWebSocketTransport(
    endpoint.webSocketUrl,
    daemonWebSocketProtocols(endpoint.token),
  );
}

function endpointToken(endpoint: HostEndpoint) {
  return endpoint.kind === "paired" ? "" : endpoint.token;
}

export type HostConnection = ReturnType<typeof createHostConnection>;

export function createHostConnection(options: HostConnectionOptions) {
  const { platform } = options;
  const openTransport =
    platform.openTransport ??
    ((endpoint: HostEndpoint) => defaultTransport(endpoint, platform));
  const listeners = new Set<HostEventListener>();
  let client: Promise<DaemonRpcClient> | null = null;

  async function resolveEndpoint() {
    try {
      return await platform.resolveEndpoint();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DaemonClientError(
        `Host ${options.hostId} is unavailable: ${reason}`,
        "UNAVAILABLE",
      );
    }
  }

  function connectClient(endpoint: HostEndpoint, onDrop: () => void) {
    const socket = openTransport(endpoint);
    const transport = createSharedTransport((handlers) =>
      socket({
        onMessage: handlers.onMessage,
        onError(error) {
          onDrop();
          handlers.onError(error);
        },
        onClose() {
          onDrop();
          handlers.onClose();
        },
      }),
    );
    return createDaemonRpcClient(transport, endpointToken(endpoint));
  }

  function getClient() {
    if (client) return client;
    const attempt = resolveEndpoint().then((endpoint) =>
      connectClient(endpoint, drop),
    );
    const drop = () => {
      if (client === attempt) client = null;
    };
    client = attempt;
    attempt.catch(drop);
    return attempt;
  }

  async function request<M extends DaemonMethod>(
    method: M,
    params?: DaemonRequestPayloadByMethod[M],
    requestOptions?: DaemonRpcRequestOptions,
  ): Promise<DaemonResultByMethod[M]> {
    const rpc = await getClient();
    return rpc.request(method, params, requestOptions);
  }

  const supervisor = createConnectionSupervisor({
    ...options.supervisor,
    signals: platform,
    async subscribe(onEvent, subscribeOptions) {
      const endpoint = await resolveEndpoint();
      return createDaemonRpcClient(
        openTransport(endpoint),
        endpointToken(endpoint),
      ).subscribe(onEvent, subscribeOptions);
    },
    async probe() {
      await request("daemon.status", undefined, { timeoutMs: 5000 });
    },
    onEvent(event, meta) {
      for (const listener of [...listeners]) {
        listener(event, meta ?? unknownPosition);
      }
    },
  });

  function whenLive(signal?: AbortSignal) {
    if (supervisor.getState().status === "live") return Promise.resolve();
    void supervisor.connect();
    return new Promise<void>((resolve, reject) => {
      const stop = supervisor.subscribeState((state) => {
        if (state.status === "live") finish();
        else if (state.status === "disposed") {
          finish(new Error(`Host ${options.hostId} was removed`));
        }
      });
      const abort = () => finish(signal?.reason ?? new Error("Aborted"));
      function finish(error?: unknown) {
        stop();
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  async function command<M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M],
    commandOptions: HostCommandOptions,
  ): Promise<DaemonResultByMethod[M]> {
    const { maxAttempts = DEFAULT_COMMAND_ATTEMPTS, ...requestOptions } =
      commandOptions;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await request(method, params, requestOptions);
      } catch (error) {
        if (!isConnectionLoss(error) || attempt >= maxAttempts) throw error;
        supervisor.wake();
        await whenLive(requestOptions.signal);
      }
    }
  }

  return {
    hostId: options.hostId,
    request,
    command,
    onEvent(listener: HostEventListener) {
      listeners.add(listener);
      void supervisor.connect();
      return () => {
        listeners.delete(listener);
      };
    },
    getState: supervisor.getState,
    subscribeState: (listener: (state: ConnectionState) => void) =>
      supervisor.subscribeState(listener),
    wake: supervisor.wake,
    dispose() {
      supervisor.dispose();
      listeners.clear();
      client = null;
    },
  };
}

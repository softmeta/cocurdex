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
  type DaemonTransportConnection,
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

export interface HostReadOptions extends DaemonRpcRequestOptions {
  maxAttempts?: number;
}

export interface HostCommandOptions extends HostReadOptions {
  idempotencyKey: string;
}

export interface HostConnectionOptions {
  hostId: string;
  platform: HostPlatform;
  supervisor?: Pick<
    ConnectionSupervisorOptions,
    "backoff" | "stableAfterMs" | "now"
  >;
  filterSessionEvents?: boolean;
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

interface HostSession {
  rpc: DaemonRpcClient;
  close(): void;
}

function singleConnectionTransport(open: DaemonTransport, onEnd: () => void) {
  let connection: DaemonTransportConnection | null = null;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  const shared = createSharedTransport((handlers) => {
    if (connection) {
      queueMicrotask(() => handlers.onClose());
      return { send: () => {}, close: () => {} };
    }
    connection = open({
      onMessage: handlers.onMessage,
      onError(error) {
        end();
        handlers.onError(error);
      },
      onClose() {
        end();
        handlers.onClose();
      },
    });
    return connection;
  });
  return {
    shared,
    close() {
      end();
      connection?.close();
    },
  };
}

export type HostConnection = ReturnType<typeof createHostConnection>;

export function createHostConnection(options: HostConnectionOptions) {
  const { platform } = options;
  const openTransport =
    platform.openTransport ??
    ((endpoint: HostEndpoint) => defaultTransport(endpoint, platform));
  const listeners = new Set<HostEventListener>();
  let session: Promise<HostSession> | null = null;

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

  function openSession(endpoint: HostEndpoint, onEnd: () => void) {
    const transport = singleConnectionTransport(openTransport(endpoint), onEnd);
    return {
      rpc: createDaemonRpcClient(transport.shared, endpointToken(endpoint)),
      close: transport.close,
    };
  }

  function getSession() {
    if (session) return session;
    const attempt: Promise<HostSession> = resolveEndpoint().then((endpoint) =>
      openSession(endpoint, end),
    );
    function end() {
      if (session === attempt) session = null;
    }
    session = attempt;
    attempt.catch(end);
    return attempt;
  }

  async function request<M extends DaemonMethod>(
    method: M,
    params?: DaemonRequestPayloadByMethod[M],
    requestOptions?: DaemonRpcRequestOptions,
  ): Promise<DaemonResultByMethod[M]> {
    const { rpc } = await getSession();
    return rpc.request(method, params, requestOptions);
  }

  const watchCounts = new Map<string, number>();
  const watchedSessions = () =>
    options.filterSessionEvents ? [...watchCounts.keys()] : null;

  const supervisor = createConnectionSupervisor({
    ...options.supervisor,
    watchedSessions: watchedSessions(),
    signals: platform,
    async subscribe(onEvent, subscribeOptions) {
      const opened = await getSession();
      try {
        const subscription = await opened.rpc.subscribe(
          onEvent,
          subscribeOptions,
        );
        return {
          close() {
            subscription.close();
            opened.close();
          },
          get epoch() {
            return subscription.epoch;
          },
          get lastSeq() {
            return subscription.lastSeq;
          },
          get replayGap() {
            return subscription.replayGap;
          },
        };
      } catch (error) {
        opened.close();
        throw error;
      }
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

  async function requestUntilAnswered<M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M] | undefined,
    options: HostReadOptions,
  ): Promise<DaemonResultByMethod[M]> {
    const { maxAttempts = DEFAULT_COMMAND_ATTEMPTS, ...requestOptions } =
      options;
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

  function command<M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M],
    commandOptions: HostCommandOptions,
  ): Promise<DaemonResultByMethod[M]> {
    return requestUntilAnswered(method, params, commandOptions);
  }

  function read<M extends DaemonMethod>(
    method: M,
    params?: DaemonRequestPayloadByMethod[M],
    readOptions: HostReadOptions = {},
  ): Promise<DaemonResultByMethod[M]> {
    return requestUntilAnswered(method, params, readOptions);
  }

  function watchSession(sessionId: string) {
    const count = watchCounts.get(sessionId) ?? 0;
    watchCounts.set(sessionId, count + 1);
    const watching =
      count === 0 && options.filterSessionEvents
        ? supervisor.watchSessions(watchedSessions())
        : Promise.resolve();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const remaining = (watchCounts.get(sessionId) ?? 1) - 1;
      if (remaining > 0) {
        watchCounts.set(sessionId, remaining);
        return;
      }
      watchCounts.delete(sessionId);
      if (options.filterSessionEvents) {
        void supervisor.watchSessions(watchedSessions());
      }
    };
    return { ready: watching, release };
  }

  return {
    hostId: options.hostId,
    watchSession,
    request,
    read,
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
      void session?.then((opened) => opened.close());
      session = null;
    },
  };
}

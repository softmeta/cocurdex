import type { CocurdexDaemonEvent, DaemonEventMeta } from "@cocurdex/shared";
import { daemonRequestTimeout } from "./client-timeout.ts";
import {
  type DaemonEventEnvelope,
  type DaemonMethod,
  type DaemonRequest,
  type DaemonRequestPayloadByMethod,
  type DaemonResultByMethod,
  daemonMethodHasNoParams,
} from "./index.ts";

export { daemonRequestTimeout } from "./client-timeout.ts";

export interface DaemonTransportHandlers {
  onMessage(message: string): void;
  onError(error: Error): void;
  onClose(): void;
}

export interface DaemonTransportConnection {
  send(message: string): void;
  close(): void;
}

export type DaemonTransport = (
  handlers: DaemonTransportHandlers,
) => DaemonTransportConnection;

export function createWebSocketTransport(url: string): DaemonTransport {
  return (handlers) => {
    const socket = new WebSocket(url);
    const pending: string[] = [];
    socket.addEventListener("open", () => {
      for (const message of pending.splice(0)) socket.send(message);
    });
    socket.addEventListener("message", (event) => {
      handlers.onMessage(String(event.data));
    });
    socket.addEventListener("error", () => {
      handlers.onError(
        new DaemonClientError("Daemon WebSocket failed", "TRANSPORT_ERROR"),
      );
    });
    socket.addEventListener("close", () => handlers.onClose());
    return {
      send(message) {
        if (socket.readyState === WebSocket.OPEN) socket.send(message);
        else pending.push(message);
      },
      close: () => socket.close(),
    };
  };
}

export interface DaemonRpcRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export interface DaemonRpcSubscribeOptions extends DaemonRpcRequestOptions {
  afterSeq?: number;
  // Daemon lifetime that produced afterSeq. Catch-up is only meaningful within
  // the same epoch; a mismatched epoch triggers a flagged replay.
  epoch?: string;
  onDisconnect?(error?: Error): void;
}

export interface DaemonEventSubscription {
  close(): void;
  readonly epoch: string | null;
  readonly lastSeq: number | null;
  // True when the journaled replay could not cover the requested position;
  // subscribers must resync authoritative state instead of trusting replay.
  readonly replayGap: boolean;
}

export class DaemonClientError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DaemonClientError";
    this.code = code;
  }
}

function parseWireMessage(text: string): Record<string, unknown> {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    message = null;
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new DaemonClientError("Invalid daemon response", "INVALID_RESPONSE");
  }
  return message as Record<string, unknown>;
}

function responseError(response: Record<string, unknown>): Error | null {
  if (!("error" in response)) {
    return null;
  }
  const error = response.error as { message?: unknown; code?: unknown } | null;
  if (
    !error ||
    typeof error.message !== "string" ||
    typeof error.code !== "string"
  ) {
    return new DaemonClientError(
      "Invalid daemon error response",
      "INVALID_RESPONSE",
    );
  }
  return new DaemonClientError(error.message, error.code);
}

export function buildDaemonRequest<M extends DaemonMethod>(
  method: M,
  params: DaemonRequestPayloadByMethod[M] | undefined,
  token: string,
  idempotencyKey?: string,
): DaemonRequest<M> {
  const id = crypto.randomUUID();
  if (daemonMethodHasNoParams(method)) {
    return { id, method, token, idempotencyKey } as DaemonRequest<M>;
  }
  return { id, method, params, token, idempotencyKey } as DaemonRequest<M>;
}

export interface DaemonRpcClient {
  request<M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M] | undefined,
    options?: DaemonRpcRequestOptions,
  ): Promise<DaemonResultByMethod[M]>;
  subscribe(
    onEvent: (event: CocurdexDaemonEvent, meta: DaemonEventMeta) => void,
    options?: DaemonRpcSubscribeOptions,
  ): Promise<DaemonEventSubscription>;
}

export function createDaemonRpcClient(
  transport: DaemonTransport,
  token: string,
): DaemonRpcClient {
  return {
    request(method, params, options) {
      const request = buildDaemonRequest(
        method,
        params,
        token,
        options?.idempotencyKey,
      );
      const timeoutMs = daemonRequestTimeout(method, options?.timeoutMs);
      options?.signal?.throwIfAborted();
      return new Promise((resolve, reject) => {
        let settled = false;
        let connection: DaemonTransportConnection | undefined;
        const finish = (error?: Error, result?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          options?.signal?.removeEventListener("abort", abort);
          connection?.close();
          if (error) reject(error);
          else resolve(result as DaemonResultByMethod[typeof method]);
        };
        const abort = () =>
          finish(
            new DaemonClientError(
              `Daemon request ${method} was aborted; its outcome may be unknown`,
              "ABORTED",
            ),
          );
        const timer = setTimeout(
          () =>
            finish(
              new DaemonClientError(
                `Daemon request ${method} timed out after ${timeoutMs}ms; its outcome may be unknown`,
                "TIMEOUT",
              ),
            ),
          timeoutMs,
        );
        options?.signal?.addEventListener("abort", abort, { once: true });
        connection = transport({
          onMessage(text) {
            let response: Record<string, unknown>;
            try {
              response = parseWireMessage(text);
            } catch (error) {
              finish(error as Error);
              return;
            }
            if (response.id !== request.id) return;
            const error = responseError(response);
            finish(error ?? undefined, response.result);
          },
          onError: (error) => finish(error),
          onClose: () =>
            finish(
              new DaemonClientError(
                `Daemon disconnected before replying to ${method}; its outcome may be unknown`,
                "DISCONNECTED",
              ),
            ),
        });
        if (settled) {
          connection.close();
          return;
        }
        connection.send(JSON.stringify(request));
      });
    },
    subscribe(onEvent, options = {}) {
      const request = buildDaemonRequest(
        "daemon.subscribe",
        { afterSeq: options.afterSeq, epoch: options.epoch },
        token,
      );
      const timeoutMs = daemonRequestTimeout(
        "daemon.subscribe",
        options.timeoutMs,
      );
      options.signal?.throwIfAborted();
      return new Promise((resolve, reject) => {
        let connected = false;
        let finished = false;
        let connection: DaemonTransportConnection | undefined;
        let lastSeq: number | null = options.afterSeq ?? null;
        let subscriptionEpoch: string | null = null;
        const queuedEvents: DaemonEventEnvelope[] = [];
        const dispatchEvent = (envelope: DaemonEventEnvelope) => {
          if (typeof envelope.seq === "number") lastSeq = envelope.seq;
          onEvent(envelope.event, {
            epoch: subscriptionEpoch,
            seq: typeof envelope.seq === "number" ? envelope.seq : null,
          });
        };
        const finish = (error: Error, silent = false) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", abort);
          connection?.close();
          if (!connected) reject(error);
          else if (!silent) options.onDisconnect?.(error);
        };
        const abort = () =>
          finish(
            new DaemonClientError("Daemon subscription was aborted", "ABORTED"),
            true,
          );
        const timer = setTimeout(
          () =>
            finish(
              new DaemonClientError(
                "Daemon subscription handshake timed out",
                "TIMEOUT",
              ),
            ),
          timeoutMs,
        );
        options.signal?.addEventListener("abort", abort, { once: true });
        connection = transport({
          onMessage(text) {
            if (finished) return;
            let message: Record<string, unknown>;
            try {
              message = parseWireMessage(text);
            } catch (error) {
              finish(error as Error);
              return;
            }
            if (message.type === "daemon.event") {
              const envelope = message as unknown as DaemonEventEnvelope;
              if (!connected) {
                queuedEvents.push(envelope);
                if (typeof envelope.seq === "number") lastSeq = envelope.seq;
                return;
              }
              dispatchEvent(envelope);
              return;
            }
            if (message.id !== request.id || connected) return;
            const error = responseError(message);
            if (error) {
              finish(error);
              return;
            }
            clearTimeout(timer);
            connected = true;
            const subscribeResult =
              typeof message.result === "object" && message.result !== null
                ? (message.result as {
                    epoch?: unknown;
                    replayGap?: unknown;
                  })
                : undefined;
            const epoch =
              typeof subscribeResult?.epoch === "string"
                ? subscribeResult.epoch
                : null;
            const replayGap = subscribeResult?.replayGap === true;
            subscriptionEpoch = epoch;
            for (const envelope of queuedEvents.splice(0)) {
              dispatchEvent(envelope);
            }
            resolve({
              close: abort,
              epoch,
              replayGap,
              get lastSeq() {
                return lastSeq;
              },
            });
          },
          onError: (error) => finish(error),
          onClose: () =>
            finish(
              new DaemonClientError(
                "Daemon subscription disconnected",
                "DISCONNECTED",
              ),
            ),
        });
        if (finished) {
          connection.close();
          return;
        }
        connection.send(JSON.stringify(request));
      });
    },
  };
}

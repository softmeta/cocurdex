import { readFile } from "node:fs/promises";
import net from "node:net";
import {
  type DaemonEventEnvelope,
  type DaemonMetadata,
  type DaemonMethod,
  type DaemonRequest,
  type DaemonRequestPayloadByMethod,
  type DaemonResultByMethod,
  daemonMethodHasNoParams,
} from "@cocurdex/rpc";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { daemonRequestTimeout } from "./client-timeout.ts";
import { getConfiguredUserDataPath, getDaemonMetadataPath } from "./paths.ts";

export interface RequestClientOptions {
  metadata?: DaemonMetadata;
  userDataPath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface DaemonEventSubscription {
  close(): void;
}

interface DaemonEventSubscriptionOptions extends RequestClientOptions {
  onDisconnect?(error?: Error): void;
}

function encodeWireMessage(message: unknown) {
  return `${JSON.stringify(message)}\n`;
}

export class DaemonClientError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DaemonClientError";
    this.code = code;
  }
}

function readJsonLines(
  socket: net.Socket,
  onMessage: (message: Record<string, unknown>) => void,
  onError: (error: Error) => void,
) {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0 && !socket.destroyed) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        let message: unknown;
        try {
          message = JSON.parse(line);
          if (!message || typeof message !== "object" || Array.isArray(message))
            throw new Error();
        } catch {
          onError(
            new DaemonClientError(
              "Invalid daemon response",
              "INVALID_RESPONSE",
            ),
          );
          return;
        }
        onMessage(message as Record<string, unknown>);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
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

export async function readDaemonMetadata(
  userDataPath = getConfiguredUserDataPath(),
) {
  const content = await readFile(getDaemonMetadataPath(userDataPath), "utf8");
  return JSON.parse(content) as DaemonMetadata;
}

type DaemonRequestArgs<M extends DaemonMethod> =
  DaemonRequestPayloadByMethod[M] extends undefined
    ? [options?: RequestClientOptions]
    : [params: DaemonRequestPayloadByMethod[M], options?: RequestClientOptions];

export function resolveDaemonRequestArgs<M extends DaemonMethod>(
  method: M,
  args: DaemonRequestArgs<M>,
): {
  options: RequestClientOptions | undefined;
  params: DaemonRequestPayloadByMethod[M] | undefined;
} {
  const hasNoParams = daemonMethodHasNoParams(method);
  return {
    params: hasNoParams
      ? undefined
      : (args[0] as DaemonRequestPayloadByMethod[M]),
    options: (hasNoParams ? args[0] : args[1]) as
      | RequestClientOptions
      | undefined,
  };
}

export async function requestDaemon<M extends DaemonMethod>(
  method: M,
  ...args: DaemonRequestArgs<M>
): Promise<DaemonResultByMethod[M]> {
  const { params, options } = resolveDaemonRequestArgs(method, args);
  const hasNoParams = daemonMethodHasNoParams(method);
  const metadata =
    options?.metadata ??
    (await readDaemonMetadata(
      options?.userDataPath ?? getConfiguredUserDataPath(),
    ));
  const id = crypto.randomUUID();
  const request = hasNoParams
    ? ({ id, method, token: metadata.token } as DaemonRequest<M>)
    : ({
        id,
        method,
        params,
        token: metadata.token,
      } as DaemonRequest<M>);

  const timeoutMs = daemonRequestTimeout(method, options?.timeoutMs);
  options?.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = net.connect(metadata.socketPath);
    let settled = false;
    const finish = (error?: Error, result?: DaemonResultByMethod[M]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", abort);
      socket.destroy();
      if (error) reject(error);
      else resolve(result as DaemonResultByMethod[M]);
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
    socket.on("error", (error) => finish(error));
    socket.once("close", () =>
      finish(
        new DaemonClientError(
          `Daemon disconnected before replying to ${method}; its outcome may be unknown`,
          "DISCONNECTED",
        ),
      ),
    );
    socket.once("connect", () => socket.write(encodeWireMessage(request)));
    readJsonLines(
      socket,
      (response) => {
        if (response.id !== id) return;
        const error = responseError(response);
        finish(error ?? undefined, response.result as DaemonResultByMethod[M]);
      },
      (error) => finish(error),
    );
  });
}

export async function subscribeDaemonEvents(
  onEvent: (event: CocurdexDaemonEvent) => void,
  options: DaemonEventSubscriptionOptions = {},
): Promise<DaemonEventSubscription> {
  const metadata =
    options.metadata ??
    (await readDaemonMetadata(
      options.userDataPath ?? getConfiguredUserDataPath(),
    ));
  const id = crypto.randomUUID();
  const request = {
    id,
    method: "daemon.subscribe",
    token: metadata.token,
  } satisfies DaemonRequest<"daemon.subscribe">;

  const timeoutMs = daemonRequestTimeout("daemon.subscribe", options.timeoutMs);
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = net.connect(metadata.socketPath);
    let connected = false;
    let finished = false;
    const finish = (error: Error, silent = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      socket.destroy();
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
    socket.on("error", (error) => finish(error));
    socket.once("close", () =>
      finish(
        new DaemonClientError(
          "Daemon subscription disconnected",
          "DISCONNECTED",
        ),
      ),
    );
    socket.once("connect", () => socket.write(encodeWireMessage(request)));
    readJsonLines(
      socket,
      (message) => {
        if (finished) return;
        if (message.type === "daemon.event") {
          if (connected)
            onEvent((message as unknown as DaemonEventEnvelope).event);
          return;
        }
        if (message.id !== id || connected) return;
        const error = responseError(message);
        if (error) {
          finish(error);
          return;
        }
        clearTimeout(timer);
        connected = true;
        resolve({ close: abort });
      },
      (error) => finish(error),
    );
  });
}

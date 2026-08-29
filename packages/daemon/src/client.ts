import { readFile } from "node:fs/promises";
import net from "node:net";
import {
  type DaemonEventEnvelope,
  type DaemonMetadata,
  type DaemonMethod,
  type DaemonRequest,
  type DaemonRequestPayloadByMethod,
  type DaemonResponse,
  type DaemonResultByMethod,
  daemonMethodHasNoParams,
} from "@cocurdex/rpc";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { getConfiguredUserDataPath, getDaemonMetadataPath } from "./paths.ts";

export interface RequestClientOptions {
  metadata?: DaemonMetadata;
  userDataPath?: string;
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

function readJsonLines(
  socket: net.Socket,
  onMessage: (message: unknown) => void,
) {
  let buffer = "";

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        onMessage(JSON.parse(line) as unknown);
      }

      newlineIndex = buffer.indexOf("\n");
    }
  });
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

  return new Promise((resolve, reject) => {
    const socket = net.connect(metadata.socketPath);

    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(encodeWireMessage(request));
    });
    readJsonLines(socket, (message) => {
      const response = message as DaemonResponse<M>;

      if (!("id" in response) || response.id !== id) {
        return;
      }

      socket.end();

      if ("error" in response) {
        reject(new Error(response.error.message));
        return;
      }

      resolve(response.result);
    });
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

  return new Promise((resolve, reject) => {
    const socket = net.connect(metadata.socketPath);
    let connected = false;
    let closedByClient = false;

    socket.once("error", (error) => {
      if (!connected) {
        reject(error);
        return;
      }
      options.onDisconnect?.(error);
    });
    socket.once("connect", () => {
      socket.write(encodeWireMessage(request));
    });
    socket.once("close", () => {
      if (connected && !closedByClient) {
        options.onDisconnect?.();
      }
    });
    readJsonLines(socket, (message) => {
      const eventEnvelope = message as DaemonEventEnvelope;
      if (eventEnvelope.type === "daemon.event") {
        onEvent(eventEnvelope.event);
        return;
      }

      const response = message as DaemonResponse<"daemon.subscribe">;
      if (!("id" in response) || response.id !== id) {
        return;
      }
      if ("error" in response) {
        socket.end();
        reject(new Error(response.error.message));
        return;
      }

      connected = true;
      resolve({
        close() {
          closedByClient = true;
          socket.end();
        },
      });
    });
  });
}

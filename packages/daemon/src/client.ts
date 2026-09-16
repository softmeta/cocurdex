import { readFile } from "node:fs/promises";
import net from "node:net";
import {
  type DaemonMetadata,
  type DaemonMethod,
  type DaemonRequestPayloadByMethod,
  type DaemonResultByMethod,
  daemonMethodHasNoParams,
} from "@cocurdex/rpc";
import {
  createDaemonRpcClient,
  type DaemonEventSubscription,
  type DaemonRpcRequestOptions,
  type DaemonRpcSubscribeOptions,
  type DaemonTransport,
} from "@cocurdex/rpc/client";
import type { CocurdexDaemonEvent, DaemonEventMeta } from "@cocurdex/shared";
import { getConfiguredUserDataPath, getDaemonMetadataPath } from "./paths.ts";

export {
  DaemonClientError,
  type DaemonEventSubscription,
} from "@cocurdex/rpc/client";

export interface RequestClientOptions extends DaemonRpcRequestOptions {
  metadata?: DaemonMetadata;
  userDataPath?: string;
}

interface DaemonEventSubscriptionOptions
  extends RequestClientOptions,
    DaemonRpcSubscribeOptions {}

export function createSocketTransport(socketPath: string): DaemonTransport {
  return (handlers) => {
    const socket = net.connect(socketPath);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("error", handlers.onError);
    socket.once("close", handlers.onClose);
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0 && !socket.destroyed) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) handlers.onMessage(line);
        newlineIndex = buffer.indexOf("\n");
      }
    });
    return {
      send(message) {
        const line = `${message}\n`;
        if (socket.connecting) socket.once("connect", () => socket.write(line));
        else socket.write(line);
      },
      close: () => socket.destroy(),
    };
  };
}

export async function readDaemonMetadata(
  userDataPath = getConfiguredUserDataPath(),
) {
  const content = await readFile(getDaemonMetadataPath(userDataPath), "utf8");
  return JSON.parse(content) as DaemonMetadata;
}

async function resolveMetadata(options?: RequestClientOptions) {
  return (
    options?.metadata ??
    readDaemonMetadata(options?.userDataPath ?? getConfiguredUserDataPath())
  );
}

async function socketClient(options?: RequestClientOptions) {
  const metadata = await resolveMetadata(options);
  return createDaemonRpcClient(
    createSocketTransport(metadata.socketPath),
    metadata.token,
  );
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
  if (hasNoParams && args.length > 1) {
    throw new Error(
      `Daemon method "${method}" takes no params; pass client options as the only argument after the method name`,
    );
  }
  if (!hasNoParams && args.length > 2) {
    throw new Error(
      `Daemon method "${method}" accepts at most params and client options`,
    );
  }
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
  const client = await socketClient(options);
  return client.request(method, params, options);
}

export async function subscribeDaemonEvents(
  onEvent: (event: CocurdexDaemonEvent, meta: DaemonEventMeta) => void,
  options: DaemonEventSubscriptionOptions = {},
): Promise<DaemonEventSubscription> {
  const client = await socketClient(options);
  return client.subscribe(onEvent, options);
}

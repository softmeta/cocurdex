import type http from "node:http";
import type { RemoteAccessSettings } from "@cocurdex/shared";
import type {
  RemoteListenerController,
  RemoteListenerState,
} from "./host-access-service";

export interface RemoteServer {
  server: http.Server;
  close(): Promise<void>;
}

const IPV4_FALLBACK_CODES = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL"]);

function listen(server: http.Server, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen({ port, host, ipv6Only: false }, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function listenOnAllInterfaces(server: http.Server, port: number) {
  try {
    await listen(server, port, "::");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (!IPV4_FALLBACK_CODES.has(code)) throw error;
    await listen(server, port, "0.0.0.0");
  }
}

export function createRemoteAccessListener(createServer: () => RemoteServer) {
  let current: { remote: RemoteServer; port: number } | null = null;
  let state: RemoteListenerState = { listening: false, error: null };
  let queue = Promise.resolve();

  const stop = async () => {
    const active = current;
    current = null;
    if (active) await active.remote.close();
  };

  const applyNow = async (settings: RemoteAccessSettings) => {
    if (!settings.enabled) {
      await stop();
      state = { listening: false, error: null };
      return;
    }
    if (current && current.port === settings.port && state.listening) return;
    await stop();
    const remote = createServer();
    try {
      await listenOnAllInterfaces(remote.server, settings.port);
      current = { remote, port: settings.port };
      state = { listening: true, error: null };
    } catch (error) {
      await remote.close().catch(() => undefined);
      state = {
        listening: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const controller: RemoteListenerController & { close(): Promise<void> } = {
    apply(settings) {
      queue = queue.then(() => applyNow(settings));
      return queue.then(() => state);
    },
    state: () => state,
    close() {
      queue = queue.then(async () => {
        await stop();
        state = { listening: false, error: null };
      });
      return queue;
    },
  };
  return controller;
}

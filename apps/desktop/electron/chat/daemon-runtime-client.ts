import { createConnectionSupervisor } from "@cocurdex/client-runtime";
import {
  readDaemonMetadata,
  subscribeDaemonEvents,
} from "@cocurdex/daemon/client";
import { createDaemonRuntimeLifecycle } from "./daemon-runtime-lifecycle";
import type {
  DaemonRuntimeClient,
  DaemonRuntimeClientOptions,
} from "./daemon-runtime-types";

export type {
  DaemonRuntimeClient,
  DaemonRuntimeStatus,
} from "./daemon-runtime-types";

export function createDaemonRuntimeClient(
  options: DaemonRuntimeClientOptions,
): DaemonRuntimeClient {
  const lifecycle = createDaemonRuntimeLifecycle(options);
  const ensureDaemon = lifecycle.ensure;
  const connection = createConnectionSupervisor({
    subscribe: (onEvent, subscribeOptions) =>
      subscribeDaemonEvents(onEvent, {
        ...subscribeOptions,
        userDataPath: options.userDataPath,
      }),
    ensure: ensureDaemon,
    backoff: { maxMs: 10_000 },
    onEvent: options.onEvent,
    onConnected: options.onConnected,
    onDisconnect(error) {
      lifecycle.invalidate();
      options.logger.warn("daemon.subscriptionDisconnected", {
        error: error.message,
      });
    },
  });
  return {
    async connection() {
      await ensureDaemon();
      const { webSocketUrl, token } = await readDaemonMetadata(
        options.userDataPath,
      );
      return { webSocketUrl, token };
    },
    async dispose() {
      connection.dispose();
      await lifecycle.dispose();
    },
    getStatus: lifecycle.getStatus,
    async initialize() {
      await ensureDaemon();
      await connection.connect();
    },
    async restart() {
      connection.reset();
      try {
        await lifecycle.restart();
      } finally {
        await connection.connect();
      }
      return lifecycle.getStatus();
    },
  };
}

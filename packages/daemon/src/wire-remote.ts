import http from "node:http";
import { SECURE_CHANNEL_WEBSOCKET_PROTOCOL } from "@cocurdex/secure-channel";
import type { WebSocket } from "ws";
import {
  createFixedWindowRateLimiter,
  type HostAccessService,
  type RemoteServer,
} from "./host-access";
import type { HostKeyStore } from "./host-access/host-key-store";
import { daemonNoiseCrypto } from "./host-access/host-key-store";
import {
  acceptSecureRemoteSocket,
  type SecureRemoteChannel,
} from "./host-access/secure-remote-socket";
import {
  attachDaemonWebSocketServer,
  closeWebSocketServer,
} from "./wire-websocket";

const PAIRING_ATTEMPTS_PER_WINDOW = 10;
const CONNECT_ATTEMPTS_PER_WINDOW = 60;
const ATTEMPT_WINDOW_MS = 60_000;

export interface RemoteServerFactoryOptions {
  hostAccess: HostAccessService;
  hostKeys: HostKeyStore;
  onChannel(channel: SecureRemoteChannel): void;
}

export function createRemoteSocketAcceptor(
  options: RemoteServerFactoryOptions,
) {
  const pairLimiter = createFixedWindowRateLimiter({
    limit: PAIRING_ATTEMPTS_PER_WINDOW,
    windowMs: ATTEMPT_WINDOW_MS,
  });
  const connectLimiter = createFixedWindowRateLimiter({
    limit: CONNECT_ATTEMPTS_PER_WINDOW,
    windowMs: ATTEMPT_WINDOW_MS,
  });

  const accept = (socket: WebSocket, remoteAddress: string | null) =>
    acceptSecureRemoteSocket(socket, remoteAddress, {
      hostAccess: options.hostAccess,
      hostKeys: () => options.hostKeys.keys().noise,
      crypto: daemonNoiseCrypto,
      pairLimiter,
      connectLimiter,
      onChannel: options.onChannel,
    });

  const createServer = (): RemoteServer => {
    const server = http.createServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    const wss = attachDaemonWebSocketServer(server, {
      protocol: SECURE_CHANNEL_WEBSOCKET_PROTOCOL,
      authorize: () => true,
      onConnection: (socket, request) =>
        accept(socket, request.socket.remoteAddress ?? null),
    });
    return {
      server,
      close: async () => {
        await closeWebSocketServer(wss);
        if (!server.listening) return;
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      },
    };
  };

  return { accept, createServer };
}

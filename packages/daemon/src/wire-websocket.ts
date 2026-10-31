import type http from "node:http";
import { DAEMON_WEBSOCKET_PROTOCOL } from "@cocurdex/rpc";
import { type WebSocket, WebSocketServer } from "ws";
import { parseWebSocketProtocolHeader } from "./websocket-auth";

export interface DaemonWebSocketOptions {
  authorize(input: {
    origin: string | undefined;
    protocols: string[];
    request: http.IncomingMessage;
  }): boolean;
  onConnection(socket: WebSocket, request: http.IncomingMessage): void;
}

export function attachDaemonWebSocketServer(
  server: http.Server,
  options: DaemonWebSocketOptions,
) {
  const wss = new WebSocketServer({
    server,
    verifyClient: ({
      origin,
      req,
    }: {
      origin: string;
      req: http.IncomingMessage;
    }) =>
      options.authorize({
        origin,
        protocols: parseWebSocketProtocolHeader(
          req.headers["sec-websocket-protocol"],
        ),
        request: req,
      }),
    handleProtocols: (protocols) =>
      protocols.has(DAEMON_WEBSOCKET_PROTOCOL)
        ? DAEMON_WEBSOCKET_PROTOCOL
        : false,
  });
  wss.on("connection", (socket, request) => {
    socket.on("error", () => socket.terminate());
    options.onConnection(socket, request);
  });
  return wss;
}

export function closeWebSocketServer(wss: WebSocketServer) {
  for (const client of wss.clients) client.terminate();
  return new Promise<void>((resolve, reject) => {
    wss.close((error) => (error ? reject(error) : resolve()));
  });
}

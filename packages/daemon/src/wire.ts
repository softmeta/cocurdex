import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import type {
  DaemonEventEnvelope,
  DaemonMetadata,
  DaemonRequest,
} from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { WebSocketServer } from "ws";
import { prepareDaemonEndpoint } from "./daemon-endpoint";
import { acquireDaemonOwnership } from "./daemon-ownership";
import { DaemonShutdownGate } from "./daemon-shutdown-gate";
import { handleDaemonRequest } from "./handler";
import {
  getConfiguredUserDataPath,
  getDaemonMetadataPath,
  getDaemonSocketPath,
} from "./paths";
import { CocurdexDaemonService } from "./service";

interface StartDaemonServerOptions {
  runtimeFingerprint: string;
  token: string;
  userDataPath?: string;
  webSocketPort?: number;
  onIdleShutdown?(): void;
}

interface DaemonConnection {
  send(message: string, onSent?: () => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

function encodeWireMessage(message: unknown) {
  return `${JSON.stringify(message)}\n`;
}

function isAllowedWebSocketOrigin(origin: string | undefined) {
  if (origin === undefined || origin.length === 0) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === "file:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

function parseWebSocketJsonFrame(data: { toString(): string }) {
  try {
    return JSON.parse(data.toString()) as unknown;
  } catch {
    return undefined;
  }
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

export async function writeDaemonMetadata(
  metadata: DaemonMetadata,
  userDataPath = getConfiguredUserDataPath(),
) {
  await mkdir(userDataPath, { recursive: true });
  const metadataPath = getDaemonMetadataPath(userDataPath);
  const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(metadata, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, metadataPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function startDaemonServer(options: StartDaemonServerOptions) {
  const ownership = await acquireDaemonOwnership(
    options.userDataPath ?? getConfiguredUserDataPath(),
  );
  const userDataPath = ownership.userDataPath;
  const socketPath = getDaemonSocketPath(userDataPath);
  const startedAt = new Date().toISOString();
  let service: CocurdexDaemonService | undefined;
  let endpoint: Awaited<ReturnType<typeof prepareDaemonEndpoint>> | undefined;
  let ready = false;
  let metadataPublished = false;
  const gate = new DaemonShutdownGate();
  const connections = new Set<DaemonConnection>();
  const attachConnection = (connection: DaemonConnection) => {
    const activeService = service;
    if (!ready || !activeService) {
      connection.close();
      return null;
    }
    connections.add(connection);
    let subscribedToDaemonEvents = false;
    const send = (message: unknown, onSent?: () => void) => {
      connection.send(encodeWireMessage(message), onSent);
    };
    const eventListener = (event: CocurdexDaemonEvent) => {
      if (!subscribedToDaemonEvents) return;
      send({ event, type: "daemon.event" } satisfies DaemonEventEnvelope);
    };
    activeService.events.on(
      "daemon.event",
      eventListener as (...args: unknown[]) => void,
    );
    connection.onClose(() => {
      connections.delete(connection);
      activeService.events.off(
        "daemon.event",
        eventListener as (...args: unknown[]) => void,
      );
    });
    return (message: unknown) => {
      void handleSocketMessage(
        activeService,
        options.token,
        message,
        send,
        gate,
        async () => {
          await close();
          options.onIdleShutdown?.();
        },
        () => {
          subscribedToDaemonEvents = true;
        },
      );
    };
  };
  const server = net.createServer((socket) => {
    socket.on("error", () => socket.destroy());
    const onMessage = attachConnection({
      send: (message, onSent) => socket.write(message, onSent),
      onClose: (listener) => socket.on("close", listener),
      close: () => socket.destroy(),
    });
    if (onMessage) readJsonLines(socket, onMessage);
  });
  let webSocketServer: WebSocketServer | undefined;
  const listenWebSocket = (port: number) =>
    new Promise<string>((resolve, reject) => {
      const wss = new WebSocketServer({
        host: "127.0.0.1",
        port,
        verifyClient: ({ origin }) => isAllowedWebSocketOrigin(origin),
      });
      webSocketServer = wss;
      wss.once("error", reject);
      wss.on("connection", (socket) => {
        socket.on("error", () => socket.terminate());
        const onMessage = attachConnection({
          send: (message, onSent) => socket.send(message, () => onSent?.()),
          onClose: (listener) => socket.on("close", listener),
          close: () => socket.terminate(),
        });
        if (!onMessage) return;
        socket.on("message", (data) => {
          const message = parseWebSocketJsonFrame(data);
          if (message === undefined) {
            socket.terminate();
            return;
          }
          onMessage(message);
        });
      });
      wss.once("listening", () => {
        wss.off("error", reject);
        const address = wss.address();
        if (!address || typeof address === "string") {
          reject(new Error("Unexpected WebSocket listener address"));
          return;
        }
        resolve(`ws://127.0.0.1:${address.port}`);
      });
    });

  let closePromise: Promise<void> | null = null;
  const close = () => {
    closePromise ??= (async () => {
      ready = false;
      try {
        try {
          for (const connection of connections) connection.close();
          if (webSocketServer) {
            const wss = webSocketServer;
            await new Promise<void>((resolve, reject) => {
              wss.close((error) => (error ? reject(error) : resolve()));
            });
          }
          if (server.listening) {
            await new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            });
          }
        } finally {
          await service?.shutdown();
        }
      } finally {
        try {
          if (metadataPublished) {
            removeOwnedDaemonMetadata(userDataPath, options.token, startedAt);
          }
        } finally {
          try {
            endpoint?.remove();
          } finally {
            ownership.release();
          }
        }
      }
    })();
    return closePromise;
  };

  try {
    const preparedEndpoint = await prepareDaemonEndpoint(socketPath);
    endpoint = preparedEndpoint;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(preparedEndpoint.bindPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    endpoint.publish();
    const webSocketUrl =
      options.webSocketPort === undefined
        ? undefined
        : await listenWebSocket(options.webSocketPort);
    service = new CocurdexDaemonService({
      runtimeFingerprint: options.runtimeFingerprint,
      socketPath,
      startedAt,
      userDataPath,
    });
    await service.state.waitForStartupRecovery();
    ready = true;
    metadataPublished = true;
    await writeDaemonMetadata(
      {
        pid: process.pid,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: options.runtimeFingerprint,
        socketPath,
        token: options.token,
        startedAt,
        webSocketUrl,
      },
      userDataPath,
    );
    service.startBackgroundRecovery();
    return { close, server, service, webSocketUrl };
  } catch (error) {
    await close();
    throw error;
  }
}

function removeOwnedDaemonMetadata(
  userDataPath: string,
  token: string,
  startedAt: string,
) {
  const metadataPath = getDaemonMetadataPath(userDataPath);
  let metadata: DaemonMetadata;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as DaemonMetadata;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return;
    throw error;
  }
  if (
    metadata.pid === process.pid &&
    metadata.token === token &&
    metadata.startedAt === startedAt
  ) {
    unlinkSync(metadataPath);
  }
}

async function handleSocketMessage(
  service: CocurdexDaemonService,
  token: string,
  message: unknown,
  send: (message: unknown, onSent?: () => void) => void,
  gate: DaemonShutdownGate,
  close: () => Promise<void>,
  subscribeToDaemonEvents: () => void,
) {
  const request = message as DaemonRequest;

  if (request.token !== token) {
    send({
      id: request.id,
      error: { code: "UNAUTHORIZED", message: "Invalid daemon token" },
    });
    return;
  }

  try {
    if (request.method === "daemon.shutdownIfIdle") {
      const status = service.status();
      if (
        request.params.pid !== status.pid ||
        request.params.startedAt !== status.startedAt
      ) {
        throw new Error("Daemon identity changed; shutdown was not accepted");
      }
      const result = gate.prepare(service.getActiveWork());
      send(
        { id: request.id, result },
        result.status === "accepted"
          ? () => {
              void close().catch((error: unknown) =>
                console.error("Daemon shutdown failed", error),
              );
            }
          : undefined,
      );
      return;
    }
    if (request.method === "daemon.subscribe") {
      subscribeToDaemonEvents();
    }
    const result =
      request.method === "daemon.status" ||
      request.method === "daemon.subscribe"
        ? await handleDaemonRequest(service, request)
        : await gate.run(() => handleDaemonRequest(service, request));
    send({ id: request.id, result });
  } catch (error) {
    send({
      id: request.id,
      error: {
        code: "REQUEST_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

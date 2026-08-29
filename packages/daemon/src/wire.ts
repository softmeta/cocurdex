import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type {
  DaemonEventEnvelope,
  DaemonMetadata,
  DaemonRequest,
} from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
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

export async function writeDaemonMetadata(
  metadata: DaemonMetadata,
  userDataPath = getConfiguredUserDataPath(),
) {
  await mkdir(userDataPath, { recursive: true });
  const metadataPath = getDaemonMetadataPath(userDataPath);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
    mode: 0o600,
  });
  await chmod(metadataPath, 0o600);
}

export async function startDaemonServer(options: StartDaemonServerOptions) {
  const userDataPath = options.userDataPath ?? getConfiguredUserDataPath();
  const socketPath = getDaemonSocketPath(userDataPath);
  const startedAt = new Date().toISOString();
  const service = new CocurdexDaemonService({
    runtimeFingerprint: options.runtimeFingerprint,
    socketPath,
    startedAt,
    userDataPath,
  });
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let subscribedToDaemonEvents = false;
    const send = (message: unknown) => {
      socket.write(encodeWireMessage(message));
    };
    const eventListener = (event: CocurdexDaemonEvent) => {
      if (!subscribedToDaemonEvents) {
        return;
      }
      send({ event, type: "daemon.event" } satisfies DaemonEventEnvelope);
    };

    service.events.on(
      "daemon.event",
      eventListener as (...args: unknown[]) => void,
    );

    socket.on("close", () => {
      sockets.delete(socket);
      service.events.off(
        "daemon.event",
        eventListener as (...args: unknown[]) => void,
      );
    });
    readJsonLines(socket, (message) => {
      void handleSocketMessage(service, options.token, message, send, () => {
        subscribedToDaemonEvents = true;
      });
    });
  });

  if (process.platform !== "win32") {
    await mkdir(path.dirname(socketPath), { recursive: true });
  }
  if (await isSocketReachable(socketPath)) {
    throw new Error(`Cocurdex daemon is already running at ${socketPath}`);
  }
  if (process.platform !== "win32") {
    await rm(socketPath, { force: true });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });

  await writeDaemonMetadata(
    {
      pid: process.pid,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: options.runtimeFingerprint,
      socketPath,
      token: options.token,
      startedAt,
    },
    userDataPath,
  );

  let closePromise: Promise<void> | null = null;
  const close = () => {
    if (!closePromise) {
      closePromise = (async () => {
        const serverClosed = new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        for (const socket of sockets) {
          socket.destroy();
        }
        await serverClosed;
        try {
          await service.shutdown();
        } finally {
          await rm(getDaemonMetadataPath(userDataPath), { force: true });
          if (process.platform !== "win32") {
            await rm(socketPath, { force: true });
          }
        }
      })();
    }
    return closePromise;
  };

  return { close, server, service };
}

async function handleSocketMessage(
  service: CocurdexDaemonService,
  token: string,
  message: unknown,
  send: (message: unknown) => void,
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
    if (request.method === "daemon.subscribe") {
      subscribeToDaemonEvents();
    }
    const result = await handleDaemonRequest(service, request);
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

function isSocketReachable(socketPath: string) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(socketPath);

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

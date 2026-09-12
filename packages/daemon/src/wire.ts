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
  onIdleShutdown?(): void;
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
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    const activeService = service;
    if (!ready || !activeService) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    let subscribedToDaemonEvents = false;
    const send = (message: unknown, onSent?: () => void) => {
      socket.write(encodeWireMessage(message), onSent);
    };
    const eventListener = (event: CocurdexDaemonEvent) => {
      if (!subscribedToDaemonEvents) return;
      send({ event, type: "daemon.event" } satisfies DaemonEventEnvelope);
    };
    activeService.events.on(
      "daemon.event",
      eventListener as (...args: unknown[]) => void,
    );
    socket.on("close", () => {
      sockets.delete(socket);
      activeService.events.off(
        "daemon.event",
        eventListener as (...args: unknown[]) => void,
      );
    });
    readJsonLines(socket, (message) => {
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
    });
  });

  let closePromise: Promise<void> | null = null;
  const close = () => {
    closePromise ??= (async () => {
      ready = false;
      try {
        try {
          for (const socket of sockets) socket.destroy();
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
      },
      userDataPath,
    );
    return { close, server, service };
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

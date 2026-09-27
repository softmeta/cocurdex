import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import type {
  DaemonEventEnvelope,
  DaemonMetadata,
  DaemonRequest,
} from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { AGENT_TOOL_HTTP_PATH } from "@cocurdex/shared";
import { WebSocketServer } from "ws";
import {
  createAgentToolHttpHandler,
  isAgentToolHttpRequest,
} from "./agent-tools";
import { prepareDaemonEndpoint } from "./daemon-endpoint";
import { acquireDaemonOwnership } from "./daemon-ownership";
import { DaemonShutdownGate } from "./daemon-shutdown-gate";
import {
  createDaemonEventJournal,
  type DaemonEventJournalEntry,
} from "./event-journal";
import { handleDaemonRequest } from "./handler";
import {
  getConfiguredUserDataPath,
  getDaemonMetadataPath,
  getDaemonSocketPath,
} from "./paths";
import {
  createDaemonReceiptStore,
  type DaemonReceiptOutcome,
  type DaemonReceiptStore,
} from "./rpc-receipts";
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
    const parsed = JSON.parse(data.toString()) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
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
  const eventJournal = createDaemonEventJournal();
  const eventSubscribers = new Set<(entry: DaemonEventJournalEntry) => void>();
  const receipts = createDaemonReceiptStore();
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
    const sendEvent = (entry: DaemonEventJournalEntry) => {
      send({
        event: entry.event,
        seq: entry.seq,
        type: "daemon.event",
      } satisfies DaemonEventEnvelope);
    };
    const eventListener = (entry: DaemonEventJournalEntry) => {
      if (!subscribedToDaemonEvents) return;
      sendEvent(entry);
    };
    eventSubscribers.add(eventListener);
    connection.onClose(() => {
      connections.delete(connection);
      eventSubscribers.delete(eventListener);
    });
    return (message: unknown) => {
      void handleSocketMessage(
        activeService,
        options.token,
        message,
        send,
        gate,
        receipts,
        async () => {
          await close();
          options.onIdleShutdown?.();
        },
        (afterSeq, requestEpoch) => {
          // Replay first, then go live: this block is synchronous, so no live
          // event can interleave between the journaled tail and the flag flip.
          const crossEpoch =
            requestEpoch !== undefined && requestEpoch !== startedAt;
          // A position from a previous daemon lifetime cannot be honored:
          // replay everything this lifetime retained and flag the gap.
          const replay = crossEpoch
            ? eventJournal.entriesAfter(0)
            : eventJournal.entriesAfter(afterSeq);
          for (const entry of replay.entries) {
            sendEvent(entry);
          }
          subscribedToDaemonEvents = true;
          return {
            epoch: startedAt,
            replayGap: crossEpoch || replay.hasGap,
          };
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
  let agentToolHandler:
    | ReturnType<typeof createAgentToolHttpHandler>
    | undefined;
  const httpServer = http.createServer((request, response) => {
    if (!isAgentToolHttpRequest(request)) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (!ready || !agentToolHandler) {
      response.writeHead(503);
      response.end();
      return;
    }
    void agentToolHandler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  const listenHttp = (port: number) =>
    new Promise<string>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, "127.0.0.1", () => {
        httpServer.off("error", reject);
        const address = httpServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Unexpected HTTP listener address"));
          return;
        }
        resolve(`127.0.0.1:${address.port}`);
      });
    });
  let webSocketServer: WebSocketServer | undefined;
  const attachWebSocket = () => {
    const wss = new WebSocketServer({
      server: httpServer,
      verifyClient: ({ origin }: { origin: string }) =>
        isAllowedWebSocketOrigin(origin),
    });
    webSocketServer = wss;
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
  };

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
          if (httpServer.listening) {
            httpServer.closeAllConnections();
            await new Promise<void>((resolve, reject) => {
              httpServer.close((error) => (error ? reject(error) : resolve()));
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
    await rm(getDaemonMetadataPath(userDataPath), { force: true });
    const httpHost = await listenHttp(options.webSocketPort ?? 0);
    const agentToolsUrl = `http://${httpHost}${AGENT_TOOL_HTTP_PATH}`;
    let webSocketUrl: string | undefined;
    if (options.webSocketPort !== undefined) {
      attachWebSocket();
      webSocketUrl = `ws://${httpHost}`;
    }
    service = new CocurdexDaemonService({
      runtimeFingerprint: options.runtimeFingerprint,
      socketPath,
      startedAt,
      userDataPath,
      agentToolsUrl,
    });
    agentToolHandler = createAgentToolHttpHandler(service.agentTools);
    service.events.on("daemon.event", (event: unknown) => {
      const entry = eventJournal.record(
        event as DaemonEventJournalEntry["event"],
      );
      for (const subscriber of eventSubscribers) {
        subscriber(entry);
      }
    });
    service.bindEventSeqProvider(() => eventJournal.currentSeq());
    await service.state.waitForStartupRecovery();
    await writeDaemonMetadata(
      {
        pid: process.pid,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: options.runtimeFingerprint,
        socketPath,
        token: options.token,
        startedAt,
        webSocketUrl,
        agentToolsUrl,
      },
      userDataPath,
    );
    metadataPublished = true;
    ready = true;
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

function normalizeAfterSeq(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function normalizeEpoch(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    ? value
    : undefined;
}

function normalizeIdempotencyKey(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    ? value
    : undefined;
}

async function handleSocketMessage(
  service: CocurdexDaemonService,
  token: string,
  message: unknown,
  send: (message: unknown, onSent?: () => void) => void,
  gate: DaemonShutdownGate,
  receipts: DaemonReceiptStore,
  close: () => Promise<void>,
  subscribeToDaemonEvents: (
    afterSeq: number | undefined,
    epoch: string | undefined,
  ) => { epoch: string; replayGap: boolean },
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
    let subscribeResult: { epoch: string; replayGap: boolean } | undefined;
    if (request.method === "daemon.subscribe") {
      subscribeResult = subscribeToDaemonEvents(
        normalizeAfterSeq(request.params?.afterSeq),
        normalizeEpoch(request.params?.epoch),
      );
    }
    const run = async (): Promise<DaemonReceiptOutcome> => {
      try {
        const result =
          request.method === "daemon.subscribe"
            ? subscribeResult
            : request.method === "daemon.status"
              ? await handleDaemonRequest(service, request)
              : await gate.run(() => handleDaemonRequest(service, request));
        return { ok: true, result };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "REQUEST_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    };
    const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey);
    const execution = idempotencyKey
      ? await receipts.execute(`${request.method}:${idempotencyKey}`, run)
      : { outcome: await run(), replayed: false };
    if (execution.outcome.ok) {
      send({ id: request.id, result: execution.outcome.result });
    } else {
      send({ id: request.id, error: execution.outcome.error });
    }
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

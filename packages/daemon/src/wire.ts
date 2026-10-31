import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import type { DaemonEventEnvelope, DaemonMetadata } from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import {
  AGENT_TOOL_HTTP_PATH,
  type HostPrincipal,
  principalHasScope,
  type TerminalDaemonEvent,
} from "@cocurdex/shared";
import type { WebSocket, WebSocketServer } from "ws";
import {
  createAgentToolHttpHandler,
  isAgentToolHttpRequest,
} from "./agent-tools";
import {
  createAttachmentHttpHandler,
  isAttachmentHttpRequest,
} from "./attachment-http";
import { createCommandReceiptLog } from "./command-receipt-log";
import { prepareDaemonEndpoint, probeDaemonEndpoint } from "./daemon-endpoint";
import {
  createDaemonHealthMonitor,
  type DaemonHealthMonitor,
} from "./daemon-health";
import type { DaemonLogging } from "./daemon-logging";
import { acquireDaemonOwnership } from "./daemon-ownership";
import { DaemonShutdownGate } from "./daemon-shutdown-gate";
import {
  createDeckAssetHttpHandler,
  createDeckDownloadHttpHandler,
  isDeckAssetHttpRequest,
  isDeckDownloadHttpRequest,
} from "./decks";
import {
  createDaemonEventJournal,
  type DaemonEventJournalEntry,
} from "./event-journal";
import { createRemoteAccessListener } from "./host-access";
import type { SecureRemoteChannel } from "./host-access/secure-remote-socket";
import {
  getConfiguredUserDataPath,
  getDaemonMetadataPath,
  getDaemonSocketPath,
  getDatabasePath,
} from "./paths";
import { createPdfHttpHandler, isPdfHttpRequest } from "./pdf-http";
import { serveRemoteFileStream } from "./remote-file-streams";
import { createDaemonReceiptStore } from "./rpc-receipts";
import { CocurdexDaemonService } from "./service";
import { createWebAssetHandler, isLoopbackHostHeader } from "./web-assets";
import {
  authorizeDaemonWebSocket,
  isAllowedWebSocketOrigin,
} from "./websocket-auth";
import { createRemoteServerFactory } from "./wire-remote";
import { handleDaemonWireMessage } from "./wire-request";
import {
  attachDaemonWebSocketServer,
  closeWebSocketServer,
} from "./wire-websocket";
import {
  createWorkspaceFileHttpHandler,
  isWorkspaceFileHttpRequest,
} from "./workspace-file-http";

interface StartDaemonServerOptions {
  logging?: DaemonLogging;
  runtimeFingerprint: string;
  token: string;
  userDataPath?: string;
  webSocketPort?: number;
  webRoot?: string;
  onIdleShutdown?(): void;
}

interface DaemonConnection {
  send(message: string, onSent?: () => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

interface DaemonTransport {
  remote: boolean;
  remoteAddress: string | null;
  deviceId?: string;
}

const LOCAL_TRANSPORT: DaemonTransport = { remote: false, remoteAddress: null };

const CREDENTIAL_FIELDS = new Set(["headersJson"]);

function withholdCredentialFields(key: string, value: unknown) {
  return CREDENTIAL_FIELDS.has(key) && value != null ? null : value;
}

function encodeWireMessage(message: unknown, withholdCredentials = false) {
  const json = withholdCredentials
    ? JSON.stringify(message, withholdCredentialFields)
    : JSON.stringify(message);
  return `${json}\n`;
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

async function isIncumbentServing(userDataPath: string) {
  const state = await probeDaemonEndpoint(
    getDaemonSocketPath(userDataPath),
  ).catch(() => "absent" as const);
  return state === "live";
}

export async function startDaemonServer(options: StartDaemonServerOptions) {
  const ownership = await acquireDaemonOwnership(
    options.userDataPath ?? getConfiguredUserDataPath(),
    { isIncumbentServing },
  );
  const userDataPath = ownership.userDataPath;
  let socketPath: string;
  try {
    socketPath = getDaemonSocketPath(userDataPath);
  } catch (error) {
    ownership.release();
    throw error;
  }
  const startedAt = new Date().toISOString();
  let service: CocurdexDaemonService | undefined;
  let health: DaemonHealthMonitor | undefined;
  let endpoint: Awaited<ReturnType<typeof prepareDaemonEndpoint>> | undefined;
  let ready = false;
  let metadataPublished = false;
  const gate = new DaemonShutdownGate();
  const connections = new Map<DaemonConnection, Set<string>>();
  const eventJournal = createDaemonEventJournal();
  const eventSubscribers = new Set<(entry: DaemonEventJournalEntry) => void>();
  const terminalSubscribers = new Set<(event: TerminalDaemonEvent) => void>();
  const receipts = createDaemonReceiptStore({
    durableLog: () => {
      const activeService = service;
      return activeService
        ? createCommandReceiptLog(async () => {
            const database = await activeService.state.getDatabase();
            return database.commandReceipts;
          })
        : null;
    },
  });
  const attachConnection = (
    connection: DaemonConnection,
    transport: DaemonTransport,
  ) => {
    const activeService = service;
    const activeHealth = health;
    if (!ready || !activeService || !activeHealth) {
      connection.close();
      return null;
    }
    const deviceIds = new Set<string>(
      transport.deviceId === undefined ? [] : [transport.deviceId],
    );
    connections.set(connection, deviceIds);
    let subscribedToDaemonEvents = false;
    let principal: HostPrincipal | null = null;
    const send = (message: unknown, onSent?: () => void) => {
      const withholdCredentials =
        principal !== null && !principalHasScope(principal, "credentials");
      connection.send(encodeWireMessage(message, withholdCredentials), onSent);
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
    const terminalListener = (event: TerminalDaemonEvent) => {
      send({ event, type: "daemon.event" } satisfies DaemonEventEnvelope);
    };
    let releaseTerminalClient: (() => void) | null = null;
    const subscribeToTerminals = () => {
      if (releaseTerminalClient || !principal) return;
      if (!principalHasScope(principal, "execute")) return;
      terminalSubscribers.add(terminalListener);
      releaseTerminalClient = activeService.terminals.retainClient();
    };
    eventSubscribers.add(eventListener);
    connection.onClose(() => {
      connections.delete(connection);
      eventSubscribers.delete(eventListener);
      terminalSubscribers.delete(terminalListener);
      releaseTerminalClient?.();
    });
    const runtime = {
      service: activeService,
      gate,
      receipts,
      observability: {
        status: () => activeService.status(),
        health: activeHealth,
        logging: options.logging ?? null,
        userDataPath,
      },
      close: async () => {
        await close();
        options.onIdleShutdown?.();
      },
    };
    const requestConnection = {
      ...transport,
      send,
      onPrincipal: (requestPrincipal: HostPrincipal) => {
        principal = requestPrincipal;
        if (requestPrincipal.kind === "device") {
          deviceIds.add(requestPrincipal.deviceId);
        }
      },
      subscribe: (afterSeq: number | undefined, requestEpoch?: string) => {
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
        subscribeToTerminals();
        return {
          epoch: startedAt,
          replayGap: crossEpoch || replay.hasGap,
        };
      },
    };
    return (message: unknown) => {
      void handleDaemonWireMessage(runtime, requestConnection, message);
    };
  };
  const attachWebSocketConnection = (
    socket: WebSocket,
    transport: DaemonTransport,
  ) => {
    const onMessage = attachConnection(
      {
        send: (message, onSent) => socket.send(message, () => onSent?.()),
        onClose: (listener) => socket.on("close", listener),
        close: () => socket.terminate(),
      },
      transport,
    );
    if (!onMessage) return;
    socket.on("message", (data) => {
      const message = parseWebSocketJsonFrame(data);
      if (message === undefined) {
        socket.terminate();
        return;
      }
      onMessage(message);
    });
  };
  const attachSecureChannel = (remote: SecureRemoteChannel) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const onMessage = attachConnection(
      {
        send: (message, onSent) => {
          void remote.channel
            .sendMessage(encoder.encode(message))
            .then(() => onSent?.(), remote.close);
        },
        onClose: remote.onClose,
        close: remote.close,
      },
      {
        remote: true,
        remoteAddress: remote.remoteAddress,
        deviceId: remote.deviceId,
      },
    );
    const activeService = service;
    if (!onMessage || !activeService) return;
    remote.onStream((stream, header) =>
      serveRemoteFileStream(stream, header, {
        principal: () =>
          activeService.hostAccess.resolveDevice(remote.deviceId),
        resolveWorkspaceFilePath: (filePath) =>
          activeService.resolveWorkspaceFilePath(filePath),
        resolvePdfPath: (filePath) => activeService.resolvePdfPath(filePath),
        attachments: activeService.attachments,
      }),
    );
    remote.onMessage((bytes) => {
      const message = parseWebSocketJsonFrame(decoder.decode(bytes));
      if (message === undefined) {
        remote.close();
        return;
      }
      onMessage(message);
    });
  };
  const server = net.createServer((socket) => {
    socket.on("error", () => socket.destroy());
    const onMessage = attachConnection(
      {
        send: (message, onSent) => socket.write(message, onSent),
        onClose: (listener) => socket.on("close", listener),
        close: () => socket.destroy(),
      },
      LOCAL_TRANSPORT,
    );
    if (onMessage) readJsonLines(socket, onMessage);
  });
  type HttpHandler = (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => Promise<void>;
  let agentToolHandler: HttpHandler | undefined;
  let pdfHandler: HttpHandler | undefined;
  let workspaceFileHandler: HttpHandler | undefined;
  let deckDownloadHandler: HttpHandler | undefined;
  let deckAssetHandler: HttpHandler | undefined;
  let attachmentHandler: HttpHandler | undefined;
  const webAssetHandler = options.webRoot
    ? createWebAssetHandler(options.webRoot)
    : undefined;
  const readyRoutes: [
    (request: http.IncomingMessage) => boolean,
    () => HttpHandler | undefined,
  ][] = [
    [isAttachmentHttpRequest, () => attachmentHandler],
    [isDeckAssetHttpRequest, () => deckAssetHandler],
    [isDeckDownloadHttpRequest, () => deckDownloadHandler],
    [isPdfHttpRequest, () => pdfHandler],
    [isWorkspaceFileHttpRequest, () => workspaceFileHandler],
    [isAgentToolHttpRequest, () => agentToolHandler],
  ];
  const serve = (
    handler: HttpHandler,
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  };
  const httpServer = http.createServer((request, response) => {
    const route = readyRoutes.find(([matches]) => matches(request));
    if (route) {
      const handler = route[1]();
      if (!ready || !handler) {
        response.writeHead(503);
        response.end();
        return;
      }
      serve(handler, request, response);
      return;
    }
    if (!webAssetHandler) {
      response.writeHead(404);
      response.end();
      return;
    }
    serve(webAssetHandler, request, response);
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
    webSocketServer = attachDaemonWebSocketServer(httpServer, {
      authorize: ({ origin, protocols }) =>
        authorizeDaemonWebSocket({ origin, protocols, token: options.token }),
      onConnection: (socket) =>
        attachWebSocketConnection(socket, LOCAL_TRANSPORT),
    });
  };
  let remoteListener: ReturnType<typeof createRemoteAccessListener> | undefined;

  let closePromise: Promise<void> | null = null;
  const close = () => {
    closePromise ??= (async () => {
      ready = false;
      try {
        try {
          for (const connection of connections.keys()) connection.close();
          await remoteListener?.close();
          if (webSocketServer) await closeWebSocketServer(webSocketServer);
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
          health?.stop();
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
    attachWebSocket();
    const webSocketUrl = `ws://${httpHost}`;
    service = new CocurdexDaemonService({
      runtimeFingerprint: options.runtimeFingerprint,
      socketPath,
      startedAt,
      userDataPath,
      agentToolsUrl,
      localToken: options.token,
      autoStartMemory: process.env.COCURDEX_DISABLE_MEMORY_AUTO_START !== "1",
    });
    const activeService = service;
    health = createDaemonHealthMonitor({
      pid: process.pid,
      startedAt,
      databasePath: getDatabasePath(userDataPath),
      activeRequests: () => gate.activeRequestCount,
      activeWork: () => activeService.getActiveWork(),
      connections: () => ({
        total: connections.size,
        devices: [...connections.values()].filter(
          (deviceIds) => deviceIds.size > 0,
        ).length,
      }),
      agentRuntimes: () => activeService.runtime.liveSessionCount,
      terminals: () => activeService.terminals.activeCount,
      logLevel: () => options.logging?.level() ?? "info",
      logDirectory: options.logging?.directory ?? null,
    });
    const hostAccess = service.hostAccess;
    agentToolHandler = createAgentToolHttpHandler(service.agentTools);
    const resolvePdfPath = service.resolvePdfPath.bind(service);
    pdfHandler = createPdfHttpHandler({
      isAllowedRequest: (request) =>
        isLoopbackHostHeader(request.headers.host) &&
        isAllowedWebSocketOrigin(request.headers.origin),
      resolvePrincipal: (token) => hostAccess.resolve(token),
      resolvePdfPath,
    });
    const resolveWorkspaceFilePath =
      service.resolveWorkspaceFilePath.bind(service);
    workspaceFileHandler = createWorkspaceFileHttpHandler({
      isAllowedRequest: (request) =>
        isLoopbackHostHeader(request.headers.host) &&
        isAllowedWebSocketOrigin(request.headers.origin),
      resolvePrincipal: (token) => hostAccess.resolve(token),
      resolveFilePath: resolveWorkspaceFilePath,
    });
    const redeemDeckDownload = service.decks.redeemDownload.bind(service.decks);
    deckDownloadHandler = createDeckDownloadHttpHandler({
      isAllowedRequest: (request) =>
        isLoopbackHostHeader(request.headers.host) &&
        isAllowedWebSocketOrigin(request.headers.origin),
      redeem: redeemDeckDownload,
    });
    const locateDeckAsset = service.decks.assets.locate.bind(
      service.decks.assets,
    );
    deckAssetHandler = createDeckAssetHttpHandler({
      isAllowedRequest: (request) =>
        isLoopbackHostHeader(request.headers.host) &&
        isAllowedWebSocketOrigin(request.headers.origin),
      resolvePrincipal: (token) => hostAccess.resolve(token),
      locate: locateDeckAsset,
    });
    attachmentHandler = createAttachmentHttpHandler({
      isAllowedRequest: (request) =>
        isLoopbackHostHeader(request.headers.host) &&
        isAllowedWebSocketOrigin(request.headers.origin),
      resolvePrincipal: (token) => hostAccess.resolve(token),
      store: service.attachments,
    });
    remoteListener = createRemoteAccessListener(
      createRemoteServerFactory({
        hostAccess,
        hostKeys: service.hostKeys,
        onChannel: attachSecureChannel,
      }),
    );
    hostAccess.bindRemoteListener(remoteListener);
    hostAccess.onDeviceAccessChanged((deviceId) => {
      for (const [connection, deviceIds] of connections) {
        if (deviceIds.has(deviceId)) connection.close();
      }
    });
    service.events.on("daemon.event", (event: unknown) => {
      const entry = eventJournal.record(
        event as DaemonEventJournalEntry["event"],
      );
      for (const subscriber of eventSubscribers) {
        subscriber(entry);
      }
    });
    service.events.on("terminal.event", (event: TerminalDaemonEvent) => {
      for (const subscriber of terminalSubscribers) {
        subscriber(event);
      }
    });
    service.bindEventSeqProvider(() => eventJournal.currentSeq());
    await service.state.waitForStartupRecovery();
    await service.hostAccessReady;
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
    await hostAccess.startRemoteListener();
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

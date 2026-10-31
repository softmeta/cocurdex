import http from "node:http";
import { readDaemonWebSocketToken } from "@cocurdex/rpc";
import {
  HOST_PAIRING_HTTP_PATH,
  HOST_SESSION_HTTP_PATH,
} from "@cocurdex/shared";
import type { WebSocket } from "ws";
import { isAgentToolHttpRequest } from "./agent-tools";
import {
  createAttachmentHttpHandler,
  isAttachmentHttpRequest,
} from "./attachment-http";
import type { DaemonAttachmentStore } from "./attachment-store";
import {
  createDeckAssetHttpHandler,
  createDeckDownloadHttpHandler,
  type DeckFile,
  isDeckAssetHttpRequest,
  isDeckDownloadHttpRequest,
} from "./decks";
import {
  createFixedWindowRateLimiter,
  createPairingHttpHandler,
  createSessionHttpHandler,
  type HostAccessService,
  isAllowedRemoteHostHeader,
  isAllowedRemoteOrigin,
  type RemoteServer,
} from "./host-access";
import { createPdfHttpHandler, isPdfHttpRequest } from "./pdf-http";
import { createWebAssetHandler } from "./web-assets";
import {
  attachDaemonWebSocketServer,
  closeWebSocketServer,
} from "./wire-websocket";
import {
  createWorkspaceFileHttpHandler,
  isWorkspaceFileHttpRequest,
} from "./workspace-file-http";

const PAIRING_ATTEMPTS_PER_WINDOW = 10;
const PAIRING_WINDOW_MS = 60_000;
const SESSION_CHECKS_PER_WINDOW = 60;

export interface RemoteServerFactoryOptions {
  hostAccess: HostAccessService;
  attachments: DaemonAttachmentStore;
  machineName: string;
  webRoot?: string;
  resolvePdfPath(filePath: string): Promise<string>;
  resolveWorkspaceFilePath(filePath: string): Promise<string>;
  redeemDeckDownload(ticket: string): Promise<DeckFile | null>;
  locateDeckAsset(hash: string): Promise<{ path: string; size: number } | null>;
  onWebSocket(socket: WebSocket, request: http.IncomingMessage): void;
}

function requestPathname(request: http.IncomingMessage) {
  try {
    return new URL(request.url ?? "/", "http://host").pathname;
  } catch {
    return null;
  }
}

function endWith(response: http.ServerResponse, status: number) {
  response.writeHead(status);
  response.end();
}

export function createRemoteServerFactory(options: RemoteServerFactoryOptions) {
  const isAllowedHost = (host: string | undefined) =>
    isAllowedRemoteHostHeader(host, options.machineName);
  const pairingHandler = createPairingHttpHandler({
    hostAccess: options.hostAccess,
    limiter: createFixedWindowRateLimiter({
      limit: PAIRING_ATTEMPTS_PER_WINDOW,
      windowMs: PAIRING_WINDOW_MS,
    }),
  });
  const sessionHandler = createSessionHttpHandler({
    hostAccess: options.hostAccess,
    limiter: createFixedWindowRateLimiter({
      limit: SESSION_CHECKS_PER_WINDOW,
      windowMs: PAIRING_WINDOW_MS,
    }),
  });
  const webAssetHandler = options.webRoot
    ? createWebAssetHandler(options.webRoot, isAllowedHost)
    : undefined;
  const pdfHandler = createPdfHttpHandler({
    remote: true,
    isAllowedRequest: (request) =>
      isAllowedRemoteOrigin(request.headers.origin, request.headers.host),
    resolvePrincipal: (token) => options.hostAccess.resolve(token),
    resolvePdfPath: options.resolvePdfPath,
  });
  const workspaceFileHandler = createWorkspaceFileHttpHandler({
    remote: true,
    isAllowedRequest: (request) =>
      isAllowedRemoteOrigin(request.headers.origin, request.headers.host),
    resolvePrincipal: (token) => options.hostAccess.resolve(token),
    resolveFilePath: options.resolveWorkspaceFilePath,
  });
  const deckDownloadHandler = createDeckDownloadHttpHandler({
    isAllowedRequest: (request) =>
      isAllowedRemoteOrigin(request.headers.origin, request.headers.host),
    redeem: options.redeemDeckDownload,
  });
  const deckAssetHandler = createDeckAssetHttpHandler({
    remote: true,
    isAllowedRequest: (request) =>
      isAllowedRemoteOrigin(request.headers.origin, request.headers.host),
    resolvePrincipal: (token) => options.hostAccess.resolve(token),
    locate: options.locateDeckAsset,
  });

  const attachmentHandler = createAttachmentHttpHandler({
    remote: true,
    isAllowedRequest: (request) =>
      isAllowedRemoteOrigin(request.headers.origin, request.headers.host),
    resolvePrincipal: (token) => options.hostAccess.resolve(token),
    store: options.attachments,
  });

  const handleRequest = async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (!isAllowedHost(request.headers.host)) {
      endWith(response, 403);
      return;
    }
    const pathname = requestPathname(request);
    if (pathname === HOST_PAIRING_HTTP_PATH) {
      await pairingHandler(request, response);
      return;
    }
    if (pathname === HOST_SESSION_HTTP_PATH) {
      sessionHandler(request, response);
      return;
    }
    if (isPdfHttpRequest(request)) {
      await pdfHandler(request, response);
      return;
    }
    if (isWorkspaceFileHttpRequest(request)) {
      await workspaceFileHandler(request, response);
      return;
    }
    if (isDeckDownloadHttpRequest(request)) {
      await deckDownloadHandler(request, response);
      return;
    }
    if (isDeckAssetHttpRequest(request)) {
      await deckAssetHandler(request, response);
      return;
    }
    if (isAttachmentHttpRequest(request)) {
      await attachmentHandler(request, response);
      return;
    }
    if (isAgentToolHttpRequest(request) || !webAssetHandler) {
      endWith(response, 404);
      return;
    }
    await webAssetHandler(request, response);
  };

  return (): RemoteServer => {
    const server = http.createServer((request, response) => {
      void handleRequest(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    const wss = attachDaemonWebSocketServer(server, {
      authorize: ({ origin, protocols, request }) => {
        if (!isAllowedHost(request.headers.host)) return false;
        if (!isAllowedRemoteOrigin(origin, request.headers.host)) return false;
        const principal = options.hostAccess.resolve(
          readDaemonWebSocketToken(protocols),
        );
        return principal?.kind === "device";
      },
      onConnection: options.onWebSocket,
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
}

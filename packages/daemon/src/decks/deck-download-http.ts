import type http from "node:http";
import {
  DAEMON_DECK_DOWNLOAD_HTTP_PATH,
  DAEMON_DECK_DOWNLOAD_TICKET_QUERY,
} from "@cocurdex/shared";
import type { DeckFile } from "./deck-service";

export interface DeckDownloadHttpHandlerOptions {
  isAllowedRequest(request: http.IncomingMessage): boolean;
  redeem(ticket: string): Promise<DeckFile | null>;
}

function readRequestUrl(request: http.IncomingMessage) {
  try {
    return new URL(request.url ?? "/", "http://host");
  } catch {
    return null;
  }
}

export function isDeckDownloadHttpRequest(request: http.IncomingMessage) {
  return readRequestUrl(request)?.pathname === DAEMON_DECK_DOWNLOAD_HTTP_PATH;
}

export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function endWith(response: http.ServerResponse, status: number) {
  response.writeHead(status, { "Cache-Control": "no-store" });
  response.end();
}

export function createDeckDownloadHttpHandler(
  options: DeckDownloadHttpHandlerOptions,
) {
  return async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (!options.isAllowedRequest(request)) {
      endWith(response, 403);
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end();
      return;
    }
    const ticket = readRequestUrl(request)?.searchParams.get(
      DAEMON_DECK_DOWNLOAD_TICKET_QUERY,
    );
    const file = ticket ? await options.redeem(ticket) : null;
    if (!file) {
      endWith(response, 404);
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(file.fileName),
      "Content-Length": file.bytes.byteLength,
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file.bytes);
  };
}

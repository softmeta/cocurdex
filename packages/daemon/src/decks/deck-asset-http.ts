import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import type http from "node:http";
import { pipeline } from "node:stream";
import { sniffImageMimeType } from "@cocurdex/deck/image-info";
import {
  DAEMON_DECK_ASSET_HASH_QUERY,
  DAEMON_DECK_ASSET_HTTP_PATH,
  type HostPrincipal,
  principalHasScope,
} from "@cocurdex/shared";
import { readBearerToken } from "../host-access";
import {
  corsHeaders,
  endWith,
  preflightHeaders,
  readRequestUrl,
} from "../pdf-http";

const SNIFF_BYTES = 8;

export interface DeckAssetHttpHandlerOptions {
  remote: boolean;
  isAllowedRequest(request: http.IncomingMessage): boolean;
  resolvePrincipal(token: string | null): HostPrincipal | null;
  locate(hash: string): Promise<{ path: string; size: number } | null>;
}

export function isDeckAssetHttpRequest(request: http.IncomingMessage) {
  return readRequestUrl(request)?.pathname === DAEMON_DECK_ASSET_HTTP_PATH;
}

function isAuthorized(principal: HostPrincipal | null, remote: boolean) {
  if (!principal) return false;
  if (remote && principal.kind === "local") return false;
  return principalHasScope(principal, "read");
}

async function sniffMimeType(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return sniffImageMimeType(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export function createDeckAssetHttpHandler(
  options: DeckAssetHttpHandlerOptions,
) {
  return async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (!options.isAllowedRequest(request)) {
      endWith(response, 403, {});
      return;
    }
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      endWith(response, 204, preflightHeaders(request));
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      endWith(response, 405, { ...cors, Allow: "GET, HEAD" });
      return;
    }
    const principal = options.resolvePrincipal(
      readBearerToken(request.headers.authorization),
    );
    if (!principal) {
      endWith(response, 401, cors);
      return;
    }
    if (!isAuthorized(principal, options.remote)) {
      endWith(response, 403, cors);
      return;
    }
    const hash = readRequestUrl(request)?.searchParams.get(
      DAEMON_DECK_ASSET_HASH_QUERY,
    );
    const blob = hash ? await options.locate(hash) : null;
    const mimeType = blob ? await sniffMimeType(blob.path) : null;
    if (!blob || !mimeType) {
      endWith(response, 404, cors);
      return;
    }
    response.writeHead(200, {
      ...cors,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": blob.size,
      "Content-Type": mimeType,
      ETag: `"${hash}"`,
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    pipeline(createReadStream(blob.path), response, () => {});
  };
}

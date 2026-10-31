import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type http from "node:http";
import { pipeline } from "node:stream";
import {
  DAEMON_PDF_HTTP_PATH,
  DAEMON_PDF_PATH_QUERY,
  type HostPrincipal,
  principalHasScope,
} from "@cocurdex/shared";
import { readBearerToken } from "./host-access";

export type ByteRange = { start: number; end: number };

export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return "unsatisfiable";
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}

export interface RangeFileHttpHandlerOptions {
  remote: boolean;
  isAllowedRequest(request: http.IncomingMessage): boolean;
  resolvePrincipal(token: string | null): HostPrincipal | null;
}

export interface PdfHttpHandlerOptions extends RangeFileHttpHandlerOptions {
  resolvePdfPath(filePath: string): Promise<string>;
}

const CORS_EXPOSED_HEADERS = "Accept-Ranges, Content-Length, Content-Range";

export function readRequestUrl(request: http.IncomingMessage) {
  try {
    return new URL(request.url ?? "/", "http://host");
  } catch {
    return null;
  }
}

export function isPdfHttpRequest(request: http.IncomingMessage) {
  return readRequestUrl(request)?.pathname === DAEMON_PDF_HTTP_PATH;
}

export function corsHeaders(
  request: http.IncomingMessage,
): http.OutgoingHttpHeaders {
  const origin = request.headers.origin;
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": CORS_EXPOSED_HEADERS,
    Vary: "Origin",
  };
}

export function preflightHeaders(
  request: http.IncomingMessage,
): http.OutgoingHttpHeaders {
  const privateNetwork =
    request.headers["access-control-request-private-network"] === "true";
  return {
    ...corsHeaders(request),
    "Access-Control-Allow-Headers": "Authorization, Range",
    "Access-Control-Allow-Methods": "GET, HEAD",
    "Access-Control-Max-Age": "600",
    ...(privateNetwork
      ? { "Access-Control-Allow-Private-Network": "true" }
      : {}),
  };
}

export function endWith(
  response: http.ServerResponse,
  status: number,
  headers: http.OutgoingHttpHeaders,
) {
  response.writeHead(status, headers);
  response.end();
}

function isAuthorized(principal: HostPrincipal | null, remote: boolean) {
  if (!principal) return false;
  if (remote && principal.kind === "local") return false;
  return principalHasScope(principal, "files.read");
}

async function statFile(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

export function createRangeFileHttpHandler(
  options: RangeFileHttpHandlerOptions & {
    pathQuery: string;
    resolvePath(filePath: string): Promise<string>;
    contentHeaders(filePath: string): http.OutgoingHttpHeaders;
  },
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
    const requestedPath = readRequestUrl(request)?.searchParams.get(
      options.pathQuery,
    );
    if (!requestedPath) {
      endWith(response, 400, cors);
      return;
    }
    let filePath: string;
    try {
      filePath = await options.resolvePath(requestedPath);
    } catch {
      endWith(response, 403, cors);
      return;
    }
    const info = await statFile(filePath);
    if (!info) {
      endWith(response, 404, cors);
      return;
    }
    const range = parseByteRange(request.headers.range, info.size);
    const baseHeaders: http.OutgoingHttpHeaders = {
      ...cors,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      ...options.contentHeaders(filePath),
      "Last-Modified": info.mtime.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };
    if (range === "unsatisfiable") {
      endWith(response, 416, {
        ...baseHeaders,
        "Content-Range": `bytes */${info.size}`,
      });
      return;
    }
    const { start, end } = range ?? { start: 0, end: info.size - 1 };
    const length = Math.max(0, end - start + 1);
    response.writeHead(range ? 206 : 200, {
      ...baseHeaders,
      "Content-Length": length,
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${info.size}` }
        : {}),
    });
    if (request.method === "HEAD" || length === 0) {
      response.end();
      return;
    }
    pipeline(createReadStream(filePath, { start, end }), response, () => {});
  };
}

export function createPdfHttpHandler(options: PdfHttpHandlerOptions) {
  return createRangeFileHttpHandler({
    ...options,
    pathQuery: DAEMON_PDF_PATH_QUERY,
    resolvePath: options.resolvePdfPath,
    contentHeaders: () => ({ "Content-Type": "application/pdf" }),
  });
}

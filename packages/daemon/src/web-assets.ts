import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type http from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".bcmap": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pfb": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

const INDEX_FILE = "index.html";

export function isLoopbackHostHeader(host: string | undefined) {
  if (!host) return false;
  let url: URL;
  try {
    url = new URL(`http://${host}`);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTNAMES.has(url.hostname);
}

export function resolveWebAssetPath(root: string, requestUrl: string) {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://host").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, `.${pathname}`);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

function cacheControl(filePath: string, root: string) {
  const relative = path.relative(root, filePath).split(path.sep);
  return relative[0] === "assets"
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

async function findFile(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function sendStatus(response: http.ServerResponse, status: number) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end();
}

export function createWebAssetHandler(root: string) {
  const resolvedRoot = path.resolve(root);
  return async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendStatus(response, 405);
      return;
    }
    if (!isLoopbackHostHeader(request.headers.host)) {
      sendStatus(response, 403);
      return;
    }
    const target = resolveWebAssetPath(resolvedRoot, request.url ?? "/");
    if (!target) {
      sendStatus(response, 400);
      return;
    }
    const hasExtension = path.extname(target) !== "";
    const filePath =
      (await findFile(target)) ??
      (await findFile(path.join(target, INDEX_FILE))) ??
      (hasExtension
        ? null
        : await findFile(path.join(resolvedRoot, INDEX_FILE)));
    if (!filePath) {
      sendStatus(response, 404);
      return;
    }
    response.writeHead(200, {
      "Cache-Control": cacheControl(filePath, resolvedRoot),
      "Content-Type":
        CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  };
}

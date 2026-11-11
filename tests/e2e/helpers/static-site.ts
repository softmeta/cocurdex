import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

export interface StaticSite {
  url: string;
  close(): Promise<void>;
}

async function servedFile(root: string, urlPath: string) {
  const name = path
    .normalize(decodeURIComponent(urlPath))
    .replace(/^[/\\]+/, "");
  const file = path.join(root, name || "index.html");
  if (path.relative(root, file).startsWith("..")) return null;
  const info = await stat(file).catch(() => null);
  return info?.isFile() ? file : null;
}

export function serveStaticSite(root: string): Promise<StaticSite> {
  const server = http.createServer((request, response) => {
    const urlPath = new URL(request.url ?? "/", "http://site").pathname;
    void servedFile(root, urlPath).then((file) => {
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

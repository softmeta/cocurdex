import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  createWebAssetHandler,
  isLoopbackHostHeader,
  resolveWebAssetPath,
} from "@cocurdex/daemon/internal/web-assets";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

let parent: string;
let root: string;
let server: http.Server;
let port: number;

beforeAll(async () => {
  parent = await tempDirs.create("cocurdex-web-");
  root = path.join(parent, "site");
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "index.html"), "<!doctype html>app");
  await writeFile(path.join(root, "assets", "index-abc.js"), "export {}");
  await writeFile(path.join(path.dirname(root), "secret.txt"), "secret");
  const handler = createWebAssetHandler(root);
  server = http.createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await tempDirs.cleanup();
});

function get(pathname: string, host = `127.0.0.1:${port}`) {
  return new Promise<{
    status: number;
    body: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: pathname, headers: { host } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body,
            headers: response.headers,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("web assets", () => {
  it("serves the app shell and hashed assets with matching cache policy", async () => {
    const shell = await get("/");
    expect(shell.status).toBe(200);
    expect(shell.body).toContain("app");
    expect(shell.headers["cache-control"]).toBe("no-cache");
    const asset = await get("/assets/index-abc.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["content-type"]).toMatch(/javascript/);
    expect(asset.headers["cache-control"]).toMatch(/immutable/);
  });

  it("falls back to the app shell for client routes but not for missing files", async () => {
    expect((await get("/sessions/abc")).body).toContain("app");
    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  it("never serves files outside the web root", async () => {
    expect((await get("/../secret.txt")).body).not.toContain("secret");
    expect((await get("/%2e%2e/secret.txt")).body).not.toContain("secret");
    expect(resolveWebAssetPath(root, "/%2e%2e/secret.txt")).toBe(
      path.join(root, "secret.txt"),
    );
    expect(resolveWebAssetPath(root, "/..%2fsecret.txt")).toBeNull();
    expect(resolveWebAssetPath(root, "/a%00b")).toBeNull();
  });

  it("rejects non-loopback hosts to block DNS rebinding", async () => {
    expect((await get("/", "attacker.example:80")).status).toBe(403);
    expect(isLoopbackHostHeader("localhost:5173")).toBe(true);
    expect(isLoopbackHostHeader("[::1]:9000")).toBe(true);
    expect(isLoopbackHostHeader(undefined)).toBe(false);
  });
});

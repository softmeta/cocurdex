import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createDeckAssetHttpHandler } from "@cocurdex/daemon/internal/decks/deck-asset-http";
import { DeckAssetStore } from "@cocurdex/daemon/internal/decks/deck-assets";
import { buildDaemonDeckAssetUrl, type HostPrincipal } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PNG_PATH = createRequire(import.meta.url).resolve(
  "./fixtures/swatch-3x2.png",
);
const PNG = readFileSync(PNG_PATH);

const PRINCIPALS: Record<string, HostPrincipal> = {
  local: { kind: "local" },
  reader: { kind: "device", deviceId: "d1", scopes: ["read"] },
  blind: { kind: "device", deviceId: "d2", scopes: ["files.read"] },
};

const tempDirs = createTempDirs();
let store: DeckAssetStore;
let sourceDir: string;

beforeAll(async () => {
  store = DeckAssetStore.open(await tempDirs.create("deck-assets-"));
  sourceDir = await tempDirs.create("deck-sources-");
});

afterAll(() => tempDirs.cleanup());

describe("DeckAssetStore", () => {
  it("imports a PNG by content hash with its size", async () => {
    const image = await store.importFile(PNG_PATH);
    expect(image).toEqual({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      mimeType: "image/png",
      width: 3,
      height: 2,
    });
    expect(await store.load(image.hash)).toEqual(PNG);
    await expect(store.requireAll([image.hash])).resolves.toBeUndefined();
  });

  it("rejects relative paths, other formats, and unknown hashes", async () => {
    const gifPath = path.join(sourceDir, "a.gif");
    await writeFile(gifPath, "GIF89a\u0001\u0000\u0001\u0000", "latin1");
    await expect(store.importFile("a.png")).rejects.toThrow("absolute");
    await expect(store.importFile(gifPath)).rejects.toThrow("PNG and JPEG");
    await expect(store.requireAll(["d".repeat(64)])).rejects.toThrow(
      "deck.importImage",
    );
  });
});

describe("createDeckAssetHttpHandler", () => {
  const servers: http.Server[] = [];

  afterAll(() =>
    Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    ),
  );

  async function serve() {
    const handler = createDeckAssetHttpHandler({
      isAllowedRequest: () => true,
      resolvePrincipal: (token) => (token ? (PRINCIPALS[token] ?? null) : null),
      locate: (hash) => store.locate(hash),
    });
    const server = http.createServer((request, response) => {
      void handler(request, response);
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    return (hash: string, token?: string) =>
      fetch(buildDaemonDeckAssetUrl(`ws://127.0.0.1:${port}`, hash), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
  }

  it("serves an imported image as an immutable, typed response", async () => {
    const { hash } = await store.importFile(PNG_PATH);
    const get = await serve();
    const response = await get(hash, "local");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("requires a token with read scope and hides unknown hashes", async () => {
    const { hash } = await store.importFile(PNG_PATH);
    const local = await serve();

    expect((await local(hash)).status).toBe(401);
    expect((await local(hash, "blind")).status).toBe(403);
    expect((await local(hash, "reader")).status).toBe(200);
    expect((await local("e".repeat(64), "local")).status).toBe(404);
    expect((await local("../../etc/passwd", "local")).status).toBe(404);
  });
});

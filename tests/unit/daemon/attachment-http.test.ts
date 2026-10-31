import { readdir } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createAttachmentHttpHandler } from "@cocurdex/daemon/internal/attachment-http";
import { DaemonAttachmentStore } from "@cocurdex/daemon/internal/attachment-store";
import {
  buildDaemonAttachmentUploadUrl,
  buildDaemonImageAttachmentUrl,
  type HostPrincipal,
  type ImageAttachment,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

const LOCAL_TOKEN = "local-token";
const READER_TOKEN = "reader-token";
const WRITER_TOKEN = "writer-token";
const VIEWER_TOKEN = "viewer-token";

const PRINCIPALS: Record<string, HostPrincipal> = {
  [LOCAL_TOKEN]: { kind: "local" },
  [READER_TOKEN]: {
    kind: "device",
    deviceId: "reader",
    scopes: ["read", "files.read"],
  },
  [VIEWER_TOKEN]: {
    kind: "device",
    deviceId: "viewer",
    scopes: ["read", "interact"],
  },
  [WRITER_TOKEN]: {
    kind: "device",
    deviceId: "writer",
    scopes: ["read", "files.read", "interact"],
  },
};

const GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00,
]);

describe("createAttachmentHttpHandler", () => {
  let userDataPath: string;
  let server: http.Server;
  let webSocketUrl: string;

  const startServer = async (remote: boolean) => {
    const handler = createAttachmentHttpHandler({
      remote,
      isAllowedRequest: (request) =>
        request.headers.origin !== "http://evil.example",
      resolvePrincipal: (token) => (token ? (PRINCIPALS[token] ?? null) : null),
      store: new DaemonAttachmentStore(userDataPath),
    });
    server = http.createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    webSocketUrl = `ws://127.0.0.1:${port}`;
  };

  const upload = (
    token: string | null,
    body: Buffer,
    kind: "image" | "document" = "image",
  ) =>
    fetch(buildDaemonAttachmentUploadUrl(webSocketUrl, kind, "shot.gif"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });

  const storedImages = async () => {
    try {
      return await readdir(path.join(userDataPath, "image-attachments"));
    } catch {
      return [];
    }
  };

  beforeEach(async () => {
    userDataPath = await tempDirs.create("cocurdex-attachment-http-");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("uploads an image and serves it back", async () => {
    await startServer(true);

    const response = await upload(WRITER_TOKEN, GIF);
    expect(response.status).toBe(201);
    const attachment = (await response.json()) as ImageAttachment;
    expect(attachment).toMatchObject({
      kind: "image",
      mimeType: "image/gif",
      name: "shot.gif",
      width: 2,
      height: 3,
    });

    const read = await fetch(
      buildDaemonImageAttachmentUrl(webSocketUrl, attachment.filePath),
      { headers: { Authorization: `Bearer ${READER_TOKEN}` } },
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toBe("image/gif");
    expect(Buffer.from(await read.arrayBuffer())).toEqual(GIF);
  });

  it("serves a sent image to a device paired without files.read", async () => {
    await startServer(true);

    const attachment = (await (
      await upload(VIEWER_TOKEN, GIF)
    ).json()) as ImageAttachment;
    const read = await fetch(
      buildDaemonImageAttachmentUrl(webSocketUrl, attachment.filePath),
      { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } },
    );
    expect(read.status).toBe(200);
  });

  it("refuses a device without interact scope and keeps nothing", async () => {
    await startServer(true);

    expect((await upload(READER_TOKEN, GIF)).status).toBe(403);
    expect((await upload(null, GIF)).status).toBe(401);
    expect(await storedImages()).toEqual([]);
  });

  it("refuses the local token on the remote listener", async () => {
    await startServer(true);

    expect((await upload(LOCAL_TOKEN, GIF)).status).toBe(403);
    expect(await storedImages()).toEqual([]);
  });

  it("reports unsupported and oversized uploads without storing them", async () => {
    await startServer(false);

    const unsupported = await upload(LOCAL_TOKEN, Buffer.from("plain text"));
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      error: "Only PNG, JPEG, GIF, or WebP images are supported",
    });

    const oversized = await upload(
      LOCAL_TOKEN,
      Buffer.alloc(10 * 1024 * 1024 + 1),
    );
    expect(oversized.status).toBe(413);
    expect(await storedImages()).toEqual([]);
  });

  it("does not serve files outside image storage", async () => {
    await startServer(false);

    const response = await fetch(
      buildDaemonImageAttachmentUrl(
        webSocketUrl,
        path.join(userDataPath, "cocurdex.sqlite"),
      ),
      { headers: { Authorization: `Bearer ${LOCAL_TOKEN}` } },
    );
    expect(response.status).toBe(404);
  });
});

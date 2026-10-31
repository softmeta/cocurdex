import { writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  createPdfHttpHandler,
  parseByteRange,
} from "@cocurdex/daemon/internal/pdf-http";
import { buildDaemonPdfUrl, type HostPrincipal } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

describe("parseByteRange", () => {
  it("reads closed, open-ended, and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it("clamps the end to the file size", () => {
    expect(parseByteRange("bytes=500-5000", 1000)).toEqual({
      start: 500,
      end: 999,
    });
  });

  it("rejects ranges outside the file", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=20-10", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });

  it("serves the whole file for absent or unsupported range headers", () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-9", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
  });
});

const LOCAL_TOKEN = "local-token";
const READER_TOKEN = "reader-token";
const NO_SCOPE_TOKEN = "no-scope-token";

const PRINCIPALS: Record<string, HostPrincipal> = {
  [LOCAL_TOKEN]: { kind: "local" },
  [READER_TOKEN]: { kind: "device", deviceId: "d1", scopes: ["files.read"] },
  [NO_SCOPE_TOKEN]: { kind: "device", deviceId: "d2", scopes: [] },
};

describe("createPdfHttpHandler", () => {
  let directory: string;
  let pdfPath: string;
  let server: http.Server;
  let baseUrl: string;
  const bytes = Buffer.from(
    Array.from({ length: 4096 }, (_, index) => index % 251),
  );

  const startServer = async (remote: boolean) => {
    const handler = createPdfHttpHandler({
      remote,
      isAllowedRequest: (request) =>
        request.headers.origin !== "http://evil.example",
      resolvePrincipal: (token) => (token ? (PRINCIPALS[token] ?? null) : null),
      resolvePdfPath: async (filePath) => {
        if (path.dirname(filePath) !== directory) throw new Error("outside");
        return filePath;
      },
    });
    server = http.createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    baseUrl = `ws://127.0.0.1:${port}`;
  };

  const request = (
    filePath: string,
    init: { token?: string; headers?: Record<string, string> } = {},
  ) =>
    fetch(buildDaemonPdfUrl(baseUrl, filePath), {
      headers: {
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
    });

  beforeEach(async () => {
    directory = await tempDirs.create("cocurdex-pdf-http-");
    pdfPath = path.join(directory, "book.pdf");
    await writeFile(pdfPath, bytes);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await tempDirs.cleanup();
  });

  it("serves the full file with range support advertised", async () => {
    await startServer(false);
    const response = await request(pdfPath, { token: LOCAL_TOKEN });
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("4096");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("serves only the requested byte range", async () => {
    await startServer(false);
    const response = await request(pdfPath, {
      token: READER_TOKEN,
      headers: { Range: "bytes=100-199" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/4096");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(100, 200),
    );
  });

  it("answers an unsatisfiable range with 416", async () => {
    await startServer(false);
    const response = await request(pdfPath, {
      token: LOCAL_TOKEN,
      headers: { Range: "bytes=5000-" },
    });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */4096");
  });

  it("requires a token with the files.read scope", async () => {
    await startServer(false);
    expect((await request(pdfPath)).status).toBe(401);
    expect((await request(pdfPath, { token: "unknown" })).status).toBe(401);
    expect((await request(pdfPath, { token: NO_SCOPE_TOKEN })).status).toBe(
      403,
    );
  });

  it("refuses the local token on the remote listener", async () => {
    await startServer(true);
    expect((await request(pdfPath, { token: LOCAL_TOKEN })).status).toBe(403);
    expect((await request(pdfPath, { token: READER_TOKEN })).status).toBe(200);
  });

  it("refuses paths the workspace authorization rejects", async () => {
    await startServer(false);
    const outside = path.join(os.tmpdir(), "elsewhere.pdf");
    expect((await request(outside, { token: LOCAL_TOKEN })).status).toBe(403);
    const missing = path.join(directory, "missing.pdf");
    expect((await request(missing, { token: LOCAL_TOKEN })).status).toBe(404);
  });

  it("answers CORS preflights and exposes the range headers", async () => {
    await startServer(false);
    const origin = "http://localhost:5173";
    const preflight = await fetch(buildDaemonPdfUrl(baseUrl, pdfPath), {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization, range",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "Range",
    );
    const response = await request(pdfPath, {
      token: LOCAL_TOKEN,
      headers: { Origin: origin },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "Accept-Ranges",
    );
  });

  it("rejects requests from disallowed origins", async () => {
    await startServer(false);
    const response = await request(pdfPath, {
      token: LOCAL_TOKEN,
      headers: { Origin: "http://evil.example" },
    });
    expect(response.status).toBe(403);
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import {
  recallMemoriesViaRuntime,
  rememberMemoryViaRuntime,
  showMemoryViaRuntime,
} from "@cocurdex/daemon/internal/memory/rsrs";
import {
  callRuntimeTool,
  findRuntime,
  listRuntimeTools,
} from "@cocurdex/daemon/internal/memory/runtime";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

type Handler = (
  method: string,
  params: Record<string, unknown>,
) => Record<string, unknown>;

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startRuntime(
  handler: Handler,
  health: Record<string, unknown> = {},
) {
  const server = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      if (request.method === "GET" && request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            server: "respire",
            v: 1,
            pid: 4242,
            runtime_version: "1.0.0",
            ...health,
          }),
        );
        return;
      }
      const body = JSON.parse(await readBody(request)) as {
        method?: string;
        params?: Record<string, unknown>;
      };
      const method = body.method ?? "";
      const params = body.params ?? {};
      const result =
        method === "tools/list"
          ? handler("tools/list", params)
          : handler(String(params.name), params);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function writeEndpointFile(dataDir: string, url: string) {
  const runtimeDir = path.join(dataDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, "endpoint.json"),
    JSON.stringify({ bin: "1.0.0", pid: 4242, url, v: 1 }),
    "utf8",
  );
}

function toolText(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

describe("rsrs runtime client", () => {
  it("discovers the endpoint and calls MCP tools", async () => {
    const runtime = await startRuntime((method, params) => {
      if (method === "tools/list") {
        return {
          tools: [
            {
              name: "memory_recall",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
              },
            },
          ],
        };
      }
      if (method === "memory_status") {
        return toolText({ command: "status", status: "ok", summary: {} });
      }
      throw new Error(`unexpected tool ${method} ${JSON.stringify(params)}`);
    });
    const dataDir = await temp.create("cocurdex-runtime-");
    await writeEndpointFile(dataDir, runtime.url);
    try {
      const endpoint = await findRuntime(dataDir);
      expect(endpoint).toEqual({ url: runtime.url, bin: "1.0.0", pid: 4242 });
      if (!endpoint) throw new Error("expected an endpoint");
      const catalog = await listRuntimeTools(endpoint);
      expect(catalog.get("memory_recall")).toEqual(new Set(["query"]));
      const status = await callRuntimeTool(
        endpoint,
        "memory_status",
        {},
        5_000,
      );
      expect(status).toMatchObject({ command: "status", status: "ok" });
    } finally {
      await runtime.close();
    }
  });

  it("ignores a runtime that speaks another protocol version", async () => {
    const runtime = await startRuntime(() => ({ tools: [] }), { v: 2 });
    const dataDir = await temp.create("cocurdex-runtime-");
    await writeEndpointFile(dataDir, runtime.url);
    try {
      await expect(findRuntime(dataDir)).resolves.toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it("reports a failed tool call with the runtime's diagnostic", async () => {
    const runtime = await startRuntime(() => ({
      content: [{ type: "text", text: "tool failed: entry: not found" }],
      isError: true,
    }));
    try {
      await expect(
        callRuntimeTool(
          { url: runtime.url, bin: null, pid: null },
          "memory_show",
          { id: "missing" },
          5_000,
        ),
      ).rejects.toThrow("tool failed: entry: not found");
    } finally {
      await runtime.close();
    }
  });

  it("parses recall entries returned by the runtime", async () => {
    const runtime = await startRuntime(() =>
      toolText({
        command: "recall",
        status: "ok",
        details: [
          {
            entry: {
              id: "memory-1",
              title: "Runtime recall",
              importance: "important",
              updated_at: "2026-10-30T00:00:00.000Z",
            },
          },
          { entry: { id: "memory-2", title: "Second" } },
        ],
      }),
    );
    try {
      const result = await recallMemoriesViaRuntime(
        { url: runtime.url, bin: null, pid: null },
        { query: "anything", limit: 5 },
      );
      expect(result.items).toEqual([
        {
          id: "memory-1",
          title: "Runtime recall",
          score: null,
          importance: "important",
          updatedAt: "2026-10-30T00:00:00.000Z",
        },
        {
          id: "memory-2",
          title: "Second",
          score: null,
          importance: null,
          updatedAt: null,
        },
      ]);
    } finally {
      await runtime.close();
    }
  });

  it("parses show and remember payloads from the runtime", async () => {
    const runtime = await startRuntime((method) => {
      if (method === "memory_show") {
        return toolText({
          command: "show",
          status: "ok",
          details: {
            entry: { id: "memory-1", title: "Shown", content: "Body" },
          },
        });
      }
      return toolText({
        command: "remember",
        status: "ok",
        summary: { action: "created", id: "memory-9" },
      });
    });
    try {
      const endpoint = { url: runtime.url, bin: null, pid: null };
      const shown = await showMemoryViaRuntime(endpoint, "memory-1", 5_000);
      expect(shown.entry).toMatchObject({ id: "memory-1", title: "Shown" });
      const remembered = await rememberMemoryViaRuntime(
        endpoint,
        { content: "body", title: "Title", importance: "important" },
        5_000,
      );
      expect(remembered).toMatchObject({
        action: "created",
        id: "memory-9",
      });
    } finally {
      await runtime.close();
    }
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import {
  parseRememberPayload,
  recallMemories,
} from "@cocurdex/daemon/internal/memory/rsrs";
import {
  execRuntimeCli,
  findRuntime,
} from "@cocurdex/daemon/internal/memory/runtime";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

type RpcBody = Record<string, unknown> & { args: string[] };
type Handler = (body: RpcBody) => Record<string, unknown> | null;

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
      if (request.url !== "/api/rpc") {
        response.writeHead(404).end();
        return;
      }
      const body = JSON.parse(await readBody(request)) as RpcBody;
      const reply = handler(body);
      if (reply) response.end(JSON.stringify({ v: 1, id: body.id, ...reply }));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
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

describe("rsrs runtime RPC client", () => {
  it("runs partitioned recall argv through cli.exec with the health scope", async () => {
    const bodies: RpcBody[] = [];
    const dataDir = await temp.create("cocurdex-runtime-");
    const runtime = await startRuntime(
      (body) => {
        bodies.push(body);
        return {
          ok: true,
          exit: 0,
          envelope: {
            command: "recall",
            status: "ok",
            details: [{ id: "memory-1", title: "Prefers tea", score: 0.8 }],
          },
        };
      },
      {
        account_id: "account-1",
        instance_id: "instance-1",
        generation: 3,
        data_dir: dataDir,
      },
    );
    await writeEndpointFile(dataDir, runtime.url);
    try {
      const endpoint = await findRuntime(dataDir);
      if (!endpoint) throw new Error("expected an endpoint");
      const result = await recallMemories(
        (args, timeoutMs) => execRuntimeCli(endpoint, args, timeoutMs),
        { query: "tea", limit: 5, project: "cocurdex/me" },
      );
      expect(result).toEqual({
        items: [expect.objectContaining({ id: "memory-1", score: 0.8 })],
        error: null,
      });
      expect(bodies[0]).toMatchObject({
        method: "cli.exec",
        args: [
          "recall",
          "--json",
          "--titles",
          "--limit",
          "5",
          "--project",
          "cocurdex/me",
          "tea",
        ],
        scope: {
          account_id: "account-1",
          instance_id: "instance-1",
          generation: 3,
        },
      });
      expect(bodies[0].operation_id).toEqual(bodies[0].idempotency_key);
    } finally {
      await runtime.close();
    }
  });

  it("ignores a runtime that speaks another protocol version", async () => {
    const runtime = await startRuntime(() => null, { v: 2 });
    const dataDir = await temp.create("cocurdex-runtime-");
    await writeEndpointFile(dataDir, runtime.url);
    try {
      await expect(findRuntime(dataDir)).resolves.toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it("refuses a runtime that serves another data directory", async () => {
    const dataDir = await temp.create("cocurdex-runtime-");
    const otherDataDir = await temp.create("cocurdex-runtime-other-");
    const runtime = await startRuntime(() => null, { data_dir: otherDataDir });
    await writeEndpointFile(dataDir, runtime.url);
    try {
      await expect(findRuntime(dataDir)).resolves.toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it("reports a write the runtime rejected before running it as failed", async () => {
    const runtime = await startRuntime(() => ({
      ok: false,
      exit: 1,
      code: "model_switch_busy",
      error: "model switch in progress; semantic queries and writes are paused",
    }));
    try {
      const reply = await execRuntimeCli(
        { url: runtime.url, runtimeVersion: null, pid: null },
        ["remember", "--json", "body"],
        5_000,
      );
      expect(parseRememberPayload(reply.payload)).toMatchObject({
        action: "failed",
        message: expect.stringContaining("model switch in progress"),
      });
    } finally {
      await runtime.close();
    }
  });

  it("names the command when the runtime does not answer in time", async () => {
    const runtime = await startRuntime(() => null);
    try {
      await expect(
        execRuntimeCli(
          { url: runtime.url, runtimeVersion: null, pid: null },
          ["recall", "--json", "tea"],
          100,
        ),
      ).rejects.toMatchObject({
        name: "TimeoutError",
        message: "rsrs recall timed out after 100ms",
      });
    } finally {
      await runtime.close();
    }
  });
});

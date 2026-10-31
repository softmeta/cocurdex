import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { requestDaemon } from "@cocurdex/daemon/client";
import { buildDaemonPdfUrl } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, expect, it } from "vitest";
import { readProcessMemory } from "./helpers/process-memory";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

it("serves bounded ranges and keeps RPC responsive while a large download is paused", async () => {
  const root = await realpath(tempDirs.createSync("cocu-stream-"));
  const filePath = path.join(root, "large.pdf");
  const fileSize = 128 * 1024 * 1024;
  const tail = Buffer.from("last PDF bytes");
  const file = await open(filePath, "w");
  try {
    await file.truncate(fileSize);
    await file.write(tail, 0, tail.length, fileSize - tail.length);
  } finally {
    await file.close();
  }
  const daemon = await spawnDaemon({ nodeArgs: ["--inspect=127.0.0.1:0"] });
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const now = "2026-10-13T00:00:00.000Z";
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "stream-workspace",
          name: "acme-files",
          rootPaths: [root],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
    const url = buildDaemonPdfUrl(daemon.metadata.webSocketUrl, filePath);
    const headers = { Authorization: `Bearer ${daemon.metadata.token}` };
    const inspectorUrl = /Debugger listening on (ws:\/\/[^\s]+)/.exec(
      daemon.stderr(),
    )?.[1];
    if (!inspectorUrl) throw new Error("Daemon inspector did not start");
    const before = await readProcessMemory(inspectorUrl);
    const ranged = await fetch(url, {
      headers: { ...headers, Range: `bytes=-${tail.length}` },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-length")).toBe(String(tail.length));
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(tail);

    const download = await fetch(url, { headers, signal: controller.signal });
    expect(download.headers.get("content-length")).toBe(String(fileSize));
    reader = download.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    expect(first?.value?.byteLength).toBeGreaterThan(0);
    const paused = await readProcessMemory(inspectorUrl);
    expect(paused.external - before.external).toBeLessThan(fileSize / 2);
    const started = performance.now();
    const note = await requestDaemon(
      "note.create",
      { title: "During paused download" },
      daemon.options,
    );
    expect(
      await requestDaemon("note.get", { id: note.id }, daemon.options),
    ).toMatchObject({ title: note.title });
    const rpcMs = Math.round(performance.now() - started);
    expect(rpcMs).toBeLessThan(5_000);
    const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
    if (artifacts) {
      await mkdir(artifacts, { recursive: true });
      await writeFile(
        path.join(artifacts, "daemon-file-streaming.json"),
        JSON.stringify(
          {
            fileSize,
            rangeBytes: tail.length,
            pausedDownloadRpcMs: rpcMs,
            rssGrowthBytes: paused.rss - before.rss,
            externalGrowthBytes: paused.external - before.external,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    await daemon.dispose();
  }
});

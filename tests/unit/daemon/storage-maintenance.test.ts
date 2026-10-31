import { readdirSync, utimesSync } from "node:fs";
import path from "node:path";
import { StorageMaintenance } from "@cocurdex/daemon/internal/storage-maintenance";
import {
  createToolOutputStore,
  EXTERNAL_TOOL_RESULT_MIN_BYTES,
  getToolOutputsRoot,
} from "@cocurdex/daemon/internal/tool-output-store";
import { createCocurdexDatabase } from "@cocurdex/db";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

const now = "2026-10-01T00:00:00.000Z";
const largeOutput = "x".repeat(EXTERNAL_TOOL_RESULT_MIN_BYTES);

async function setup() {
  const userDataPath = tempDirs.createSync("storage-");
  const database = createCocurdexDatabase(
    path.join(userDataPath, "cocurdex.sqlite"),
  );
  await database.workspaces.upsert({
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: [path.join(userDataPath, "acme-shop")],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  await database.sessions.upsert({
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Storage",
    agentType: "pi",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  });
  const toolOutputs = createToolOutputStore(userDataPath);
  const maintenance = new StorageMaintenance({
    toolCalls: database.toolCalls,
    toolOutputs,
    commandReceipts: database.commandReceipts,
    sync: database.sync,
    reclaimFreePages: (maxPages) => database.reclaimFreePages(maxPages),
    isClosed: () => false,
  });
  return { database, maintenance, toolOutputs, userDataPath };
}

function toolCall(
  id: string,
  overrides: Partial<AgentToolCallRecord> = {},
): AgentToolCallRecord {
  return {
    id,
    sessionId: "session-1",
    title: `Run ${id}`,
    kind: "execute",
    status: "completed",
    content: [{ type: "text", text: largeOutput }],
    rawOutput: { exitCode: 0 },
    locations: [],
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function outputFiles(userDataPath: string) {
  const root = getToolOutputsRoot(userDataPath);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("StorageMaintenance", () => {
  it("moves large finished results out of the database and keeps them readable", async () => {
    const { database, maintenance, toolOutputs } = await setup();
    await database.toolCalls.upsert(toolCall("large"));
    await database.toolCalls.upsert(
      toolCall("small", { content: [{ type: "text", text: "ok" }] }),
    );
    await database.toolCalls.upsert(
      toolCall("running", { status: "in_progress" }),
    );

    await maintenance.run();

    const large = await database.toolCalls.getResultById("large");
    expect(large?.result).toEqual({ content: [], rawOutput: null });
    expect(large?.resultRef).toMatch(/^[a-f0-9]{64}$/);
    await expect(toolOutputs.get(large?.resultRef ?? "")).resolves.toEqual({
      content: [{ type: "text", text: largeOutput }],
      rawOutput: { exitCode: 0 },
    });
    expect((await database.toolCalls.getResultById("small"))?.resultRef).toBe(
      null,
    );
    expect((await database.toolCalls.getResultById("running"))?.resultRef).toBe(
      null,
    );
    database.close();
  });

  it("keeps inline output written after externalization and drops stale files later", async () => {
    const { database, maintenance, userDataPath } = await setup();
    await database.toolCalls.upsert(toolCall("tool"));
    await maintenance.run();
    const [staleFile] = outputFiles(userDataPath);

    const rewritten = toolCall("tool", {
      content: [{ type: "text", text: "short retry output" }],
      updatedAt: "2026-10-01T00:00:05.000Z",
    });
    await database.toolCalls.upsert(rewritten);
    expect(await database.toolCalls.getResultById("tool")).toEqual({
      result: {
        content: [{ type: "text", text: "short retry output" }],
        rawOutput: { exitCode: 0 },
      },
      resultRef: null,
    });

    await maintenance.run();
    expect(outputFiles(userDataPath)).toEqual([staleFile]);

    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(staleFile ?? "", longAgo, longAgo);
    await maintenance.run();
    expect(outputFiles(userDataPath)).toEqual([]);
    database.close();
  });

  it("skips a result that changed after it was read", async () => {
    const { database } = await setup();
    await database.toolCalls.upsert(toolCall("tool"));
    await database.toolCalls.upsert(
      toolCall("tool", { updatedAt: "2026-10-01T00:00:09.000Z" }),
    );

    await expect(
      database.toolCalls.externalizeResult("tool", now, "a".repeat(64)),
    ).resolves.toBe(false);
    expect((await database.toolCalls.getResultById("tool"))?.resultRef).toBe(
      null,
    );
    database.close();
  });

  it("drops command receipts older than a day", async () => {
    const { database, maintenance } = await setup();
    const dayAndAMinuteAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000 - 60_000,
    ).toISOString();
    await database.commandReceipts.save("old", "{}", dayAndAMinuteAgo);
    await database.commandReceipts.save(
      "fresh",
      "{}",
      new Date().toISOString(),
    );

    await maintenance.run();

    await expect(database.commandReceipts.get("old")).resolves.toBe(null);
    await expect(database.commandReceipts.get("fresh")).resolves.toBe("{}");
    database.close();
  });

  it("drops sync tombstones older than thirty days and raises the floor", async () => {
    const { database, maintenance } = await setup();
    await database.sessions.delete("session-1");
    const [tombstone] = database.sync.listTombstonesSince(0);
    expect(tombstone?.entityId).toBe("session-1");

    await maintenance.run();
    expect(database.sync.listTombstonesSince(0)).toHaveLength(1);

    const later = new StorageMaintenance({
      toolCalls: database.toolCalls,
      toolOutputs: createToolOutputStore(tempDirs.createSync("later-")),
      commandReceipts: database.commandReceipts,
      sync: database.sync,
      reclaimFreePages: (maxPages) => database.reclaimFreePages(maxPages),
      isClosed: () => false,
      now: () => Date.now() + 31 * 24 * 60 * 60 * 1000,
    });
    await later.run();

    expect(database.sync.listTombstonesSince(0)).toEqual([]);
    expect(database.sync.readClock().tombstoneFloor).toBe(tombstone?.changeSeq);
    database.close();
  });
});

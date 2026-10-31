import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

type Database = ReturnType<typeof createCocurdexDatabase>;

function createDatabase() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-db-"), "cocurdex.sqlite"),
  );
  tempDirs.onCleanup(() => database.close());
  return database;
}

async function seedSession(database: Database, sessionId: string) {
  const workspaceId = `${sessionId}-workspace`;
  const now = new Date().toISOString();
  await database.workspaces.upsert({
    id: workspaceId,
    name: "workspace",
    rootPaths: [`/tmp/${workspaceId}`],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  await database.sessions.upsert({
    id: sessionId,
    workspaceId,
    title: "session",
    agentType: "acp:grok-build",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
    providerSnapshot: null,
  });
}

function toolCall(
  id: string,
  sessionId: string,
  status: AgentToolCallRecord["status"],
): AgentToolCallRecord {
  const now = new Date().toISOString();
  return {
    id,
    sessionId,
    title: `tool ${id}`,
    status,
    content: [],
    locations: [],
    startedAt: now,
    updatedAt: now,
  };
}

describe("failNonTerminal", () => {
  let database: Database;

  beforeEach(async () => {
    database = createDatabase();
    await seedSession(database, "session-1");
  });

  it("fails tool calls left mid-flight and leaves terminal ones untouched", async () => {
    await database.toolCalls.upsert(toolCall("a", "session-1", "pending"));
    await database.toolCalls.upsert(toolCall("b", "session-1", "in_progress"));
    await database.toolCalls.upsert(toolCall("c", "session-1", "completed"));
    await database.toolCalls.upsert(toolCall("d", "session-1", "failed"));
    const before = await database.toolCalls.list();

    await database.toolCalls.failNonTerminal();

    const byId = new Map(
      (await database.toolCalls.list()).map((record) => [record.id, record]),
    );
    expect(byId.get("a")?.status).toBe("failed");
    expect(byId.get("b")?.status).toBe("failed");
    expect(byId.get("c")).toEqual(before.find((record) => record.id === "c"));
    expect(byId.get("d")).toEqual(before.find((record) => record.id === "d"));
  });
});

describe("subagent reference", () => {
  it("persists the provider-neutral child session relationship", async () => {
    const database = createDatabase();
    await seedSession(database, "session-1");
    const record = toolCall("task-1", "session-1", "in_progress");
    record.subagent = {
      sessionId: "child-session-1",
      type: "reviewer",
      description: "Review the current diff",
    };

    await database.toolCalls.upsert(record);

    expect(
      (await database.toolCalls.listBySessionId("session-1"))[0]?.subagent,
    ).toEqual(record.subagent);
    expect(
      (await database.toolCalls.listSummariesBySessionId("session-1"))[0]
        ?.subagent,
    ).toEqual(record.subagent);
  });
});

describe("external results", () => {
  function finished(id: string, sessionId: string, text: string) {
    return {
      ...toolCall(id, sessionId, "completed"),
      content: [{ type: "text" as const, text }],
    };
  }

  it("pages finished large results and tracks refs after externalizing", async () => {
    const database = createDatabase();
    await seedSession(database, "session-1");
    await seedSession(database, "session-2");
    await database.toolCalls.upsert(finished("a", "session-1", "x".repeat(64)));
    await database.toolCalls.upsert(finished("b", "session-1", "short"));
    await database.toolCalls.upsert(finished("c", "session-2", "y".repeat(64)));
    await database.toolCalls.upsert({
      ...finished("d", "session-2", "z".repeat(64)),
      status: "in_progress",
    });

    const first = await database.toolCalls.listExternalizableResults({
      minBytes: 64,
      limit: 1,
      afterRowId: 0,
    });
    const second = await database.toolCalls.listExternalizableResults({
      minBytes: 64,
      limit: 1,
      afterRowId: first[0]?.rowId ?? 0,
    });
    expect([...first, ...second].map((row) => row.toolCallId)).toEqual([
      "a",
      "c",
    ]);

    for (const row of [...first, ...second]) {
      await expect(
        database.toolCalls.externalizeResult(
          row.toolCallId,
          row.updatedAt,
          `${row.toolCallId}-ref`,
        ),
      ).resolves.toBe(true);
    }

    await expect(
      database.toolCalls.listExternalizableResults({
        minBytes: 64,
        limit: 10,
        afterRowId: 0,
      }),
    ).resolves.toEqual([]);
    await expect(database.toolCalls.listResultRefs()).resolves.toEqual(
      new Set(["a-ref", "c-ref"]),
    );
    await expect(
      database.toolCalls.listResultRefsBySessionId("session-1"),
    ).resolves.toEqual(new Map([["a", "a-ref"]]));
    await expect(database.toolCalls.getResultById("a")).resolves.toEqual({
      result: { content: [], rawOutput: null },
      resultRef: "a-ref",
    });
  });
});

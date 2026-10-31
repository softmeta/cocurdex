import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCocurdexDatabase } from "@cocurdex/db";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";
import type { MessageRecord } from "@cocurdex/shared";
import { seedHistoricalDatabase } from "@cocurdex/test-fixtures/database";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

const now = "2026-10-14T00:00:00.000Z";

async function open() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("sync-"), "cocurdex.sqlite"),
  );
  await database.workspaces.upsert({
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: ["/acme-shop"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  for (const id of ["session-1", "session-2"]) {
    await database.sessions.upsert({
      id,
      workspaceId: "workspace-1",
      title: id,
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    });
  }
  return database;
}

function message(
  id: string,
  sessionId: string,
  content: string,
): MessageRecord {
  return {
    id,
    sessionId,
    role: "assistant",
    content,
    attachments: [],
    createdAt: now,
  };
}

describe("sync tracking", () => {
  it("returns only rows written after a cursor", async () => {
    const database = await open();
    await database.messages.append(message("m1", "session-1", "first"));
    const cursor = database.sync.readClock().seq;

    await database.messages.append(message("m1", "session-1", "first, edited"));
    await database.messages.append(message("m2", "session-1", "second"));
    await database.messages.append(message("m3", "session-2", "elsewhere"));

    const changed = await database.messages.listChangedSince(
      "session-1",
      cursor,
    );
    expect(changed.map((row) => [row.id, row.content])).toEqual([
      ["m1", "first, edited"],
      ["m2", "second"],
    ]);
    expect(database.sync.readClock().seq).toBeGreaterThan(cursor);
    expect(
      (await database.sessions.listChangedSince(cursor)).map((row) => row.id),
    ).toEqual(expect.arrayContaining(["session-1", "session-2"]));
    database.close();
  });

  it("records deletions without one tombstone per row of a deleted session", async () => {
    const database = await open();
    await database.messages.append(message("m1", "session-1", "kept"));
    await database.messages.append(message("m2", "session-1", "dropped"));
    await database.messages.append(message("m3", "session-2", "cascaded"));
    const cursor = database.sync.readClock().seq;

    await database.messages.delete("m2");
    await database.sessions.delete("session-2");

    expect(
      database.sync
        .listTombstonesSince(cursor)
        .map(({ entity, entityId }) => [entity, entityId]),
    ).toEqual([
      ["message", "m2"],
      ["session", "session-2"],
    ]);
    database.close();
  });

  it("raises the tombstone floor when old tombstones are pruned", async () => {
    const database = await open();
    await database.messages.append(message("m1", "session-1", "gone"));
    await database.messages.delete("m1");
    const { seq } = database.sync.readClock();

    expect(database.sync.pruneTombstones("2999-01-01T00:00:00.000Z")).toBe(1);
    expect(database.sync.readClock().tombstoneFloor).toBe(seq);
    expect(database.sync.listTombstonesSince(0)).toEqual([]);
    database.close();
  });

  it("adds tracking to a version 30 database and keeps its rows", () => {
    const database = new DatabaseSync(":memory:");
    seedHistoricalDatabase(database, 30, "/acme-shop");
    const before = database.prepare("SELECT id FROM messages").all();

    initializeDatabase(database);

    expect(database.prepare("SELECT id FROM messages").all()).toEqual(before);
    const clock = database
      .prepare("SELECT seq FROM sync_clock WHERE id = 1")
      .get() as { seq: number };
    database.prepare("UPDATE messages SET content = 'edited'").run();
    const changed = database
      .prepare("SELECT id FROM messages WHERE change_seq > ?")
      .all(clock.seq);
    expect(changed).toEqual(before);
    database.close();
  });
});

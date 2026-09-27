import { DatabaseSync } from "node:sqlite";
import type { AgentToolCallRecord, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, initializeDatabase } from "./migrations";
import { createSqliteMessageRepository } from "./repositories/sqlite-message-repository";
import { createSqliteSessionRepository } from "./repositories/sqlite-session-repository";
import { createSqliteToolCallRepository } from "./repositories/sqlite-tool-call-repository";

function downgradeToVersionNine(database: DatabaseSync) {
  database.exec(`
    DROP INDEX idx_messages_session_seq;
    DROP INDEX idx_tool_calls_session_seq;
    DROP INDEX idx_sessions_imported_provider_session;
    ALTER TABLE messages DROP COLUMN seq;
    ALTER TABLE tool_calls DROP COLUMN seq;
    ALTER TABLE sessions DROP COLUMN timeline_seq;
    ALTER TABLE sessions DROP COLUMN imported_provider_session_id;
    ALTER TABLE sessions DROP COLUMN imported_at;
    PRAGMA user_version = 9;
  `);
}

function seedVersionNineDatabase() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  downgradeToVersionNine(database);
  database.exec(`
    INSERT INTO workspaces (
      id, name, root_paths, created_at, updated_at, last_opened_at
    ) VALUES (
      'workspace-1', 'repo', '["/tmp/repo"]', '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
    );

    INSERT INTO sessions (
      id, workspace_id, title, agent_type, status, write_mode, created_at,
      updated_at
    ) VALUES
      ('session-1', 'workspace-1', 'First', 'codex', 'idle', 'read-only',
       '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
      ('session-2', 'workspace-1', 'Second', 'codex', 'idle', 'read-only',
       '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

    INSERT INTO tool_calls (
      id, session_id, title, status, content_json, locations_json,
      started_at, updated_at
    ) VALUES
      ('tool-late', 'session-1', 'late', 'completed', '[]', '[]',
       '2026-09-01T00:00:04.000Z', '2026-09-01T00:00:04.000Z'),
      ('tool-tied', 'session-1', 'tied', 'completed', '[]', '[]',
       '2026-09-01T00:00:02.000Z', '2026-09-01T00:00:02.000Z');

    INSERT INTO messages (
      id, session_id, role, content, attachments_json, created_at
    ) VALUES
      ('assistant-1', 'session-1', 'assistant', 'answer', '[]',
       '2026-09-01T00:00:02.000Z'),
      ('user-1', 'session-1', 'user', 'question', '[]',
       '2026-09-01T00:00:01.000Z'),
      ('other-user', 'session-2', 'user', 'hello', '[]',
       '2026-09-01T00:00:01.000Z');

    INSERT INTO notes (id, kind, title, created_at, updated_at)
    VALUES ('note-1', 'note', 'Keep me', '2026-09-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z');

    INSERT INTO issues (id, title, created_at, updated_at)
    VALUES ('issue-1', 'Keep me too', '2026-09-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z');
  `);
  return database;
}

function timeline(database: DatabaseSync, sessionId: string) {
  return database
    .prepare(
      `SELECT id, seq FROM (
         SELECT id, seq, session_id FROM messages
         UNION ALL
         SELECT id, seq, session_id FROM tool_calls
       )
       WHERE session_id = ?
       ORDER BY seq`,
    )
    .all(sessionId);
}

function message(id: string, overrides: Partial<MessageRecord> = {}) {
  return {
    id,
    sessionId: "session-1",
    role: "assistant",
    content: id,
    attachments: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } satisfies MessageRecord;
}

function toolCall(id: string) {
  return {
    id,
    sessionId: "session-1",
    title: id,
    status: "completed",
    content: [],
    locations: [],
    startedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } satisfies AgentToolCallRecord;
}

describe("timeline sequence migration", () => {
  it("keeps every row and backfills seq in the order the timeline rendered", () => {
    const database = seedVersionNineDatabase();

    initializeDatabase(database);

    expect(database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: CURRENT_SCHEMA_VERSION,
    });
    expect(timeline(database, "session-1")).toEqual([
      { id: "user-1", seq: 1 },
      { id: "assistant-1", seq: 2 },
      { id: "tool-tied", seq: 3 },
      { id: "tool-late", seq: 4 },
    ]);
    expect(timeline(database, "session-2")).toEqual([
      { id: "other-user", seq: 1 },
    ]);
    expect(
      database
        .prepare("SELECT id, timeline_seq FROM sessions ORDER BY id")
        .all(),
    ).toEqual([
      { id: "session-1", timeline_seq: 4 },
      { id: "session-2", timeline_seq: 1 },
    ]);
    expect(database.prepare("SELECT id FROM workspaces").all()).toEqual([
      { id: "workspace-1" },
    ]);
    expect(database.prepare("SELECT id FROM notes").all()).toEqual([
      { id: "note-1" },
    ]);
    expect(database.prepare("SELECT id FROM issues").all()).toEqual([
      { id: "issue-1" },
    ]);
  });

  it("continues numbering after the backfilled rows", async () => {
    const database = seedVersionNineDatabase();
    initializeDatabase(database);
    const messages = createSqliteMessageRepository(database);

    await messages.append(message("assistant-2"));

    expect(await messages.getById("assistant-2")).toMatchObject({ seq: 5 });
  });

  it("is a no-op on a database that is already sequenced", () => {
    const database = seedVersionNineDatabase();
    initializeDatabase(database);
    const before = timeline(database, "session-1");

    initializeDatabase(database);

    expect(timeline(database, "session-1")).toEqual(before);
  });
});

describe("timeline sequence repositories", () => {
  function createDatabase() {
    const database = seedVersionNineDatabase();
    initializeDatabase(database);
    database.exec("DELETE FROM messages; DELETE FROM tool_calls;");
    return {
      database,
      messages: createSqliteMessageRepository(database),
      sessions: createSqliteSessionRepository(database),
      toolCalls: createSqliteToolCallRepository(database),
    };
  }

  it("shares one counter between messages and tool calls", async () => {
    const { messages, toolCalls } = createDatabase();

    await messages.append(message("a"));
    await toolCalls.upsert(toolCall("t"));
    await messages.append(message("b"));

    expect(
      (await messages.listBySessionId("session-1")).map((m) => m.seq),
    ).toEqual([5, 7]);
    expect(await toolCalls.listBySessionId("session-1")).toEqual([
      expect.objectContaining({ id: "t", seq: 6 }),
    ]);
  });

  it("keeps the original seq and child rows when a message is re-appended", async () => {
    const { database, messages } = createDatabase();
    await messages.append(message("a"));
    database.exec(`
      INSERT INTO message_turn_stats (
        message_id, session_id, duration_ms, completed_at
      ) VALUES ('a', 'session-1', 10, '2026-09-01T00:00:00.000Z')
    `);

    await messages.append(message("a", { content: "final" }));

    expect(await messages.getById("a")).toMatchObject({
      content: "final",
      seq: 5,
    });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM message_turn_stats")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("uses a reserved seq so late-persisted messages keep their position", async () => {
    const { messages, sessions, toolCalls } = createDatabase();
    const reserved = await sessions.allocateTimelineSeq("session-1");

    await toolCalls.upsert(toolCall("t"));
    await messages.append(message("late", { seq: reserved ?? undefined }));

    expect(reserved).toBe(5);
    expect(await messages.getById("late")).toMatchObject({ seq: 5 });
    expect(await toolCalls.listBySessionId("session-1")).toEqual([
      expect.objectContaining({ seq: 6 }),
    ]);
  });

  it("deletes rows recorded after a message regardless of timestamps", async () => {
    const { messages, toolCalls } = createDatabase();
    await messages.append(
      message("user", { createdAt: "2026-09-01T00:00:09.000Z" }),
    );
    await toolCalls.upsert(toolCall("t"));
    await messages.append(message("after"));

    await toolCalls.deleteAfter("session-1", "user");
    await messages.deleteAfter("session-1", "user");

    expect(
      (await messages.listBySessionId("session-1")).map((m) => m.id),
    ).toEqual(["user"]);
    expect(await toolCalls.listBySessionId("session-1")).toEqual([]);
  });
});

describe("imported provider sessions", () => {
  function baseSession(id: string) {
    return {
      id,
      workspaceId: "workspace-1",
      title: id,
      agentType: "codex" as const,
      status: "idle" as const,
      writeMode: "read-only" as const,
      sessionModeId: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      lastMessageAt: null,
    };
  }

  it("keeps import provenance when a later upsert omits it", async () => {
    const database = seedVersionNineDatabase();
    initializeDatabase(database);
    const sessions = createSqliteSessionRepository(database);
    await sessions.upsert({
      ...baseSession("imported"),
      importedProviderSessionId: "native-1",
      importedAt: "2026-09-02T00:00:00.000Z",
    });

    await sessions.upsert({ ...baseSession("imported"), title: "Renamed" });

    expect(await sessions.getById("imported")).toMatchObject({
      title: "Renamed",
      importedProviderSessionId: "native-1",
      importedAt: "2026-09-02T00:00:00.000Z",
    });
  });

  it("refuses to import the same native session twice", async () => {
    const database = seedVersionNineDatabase();
    initializeDatabase(database);
    const sessions = createSqliteSessionRepository(database);
    const imported = {
      importedProviderSessionId: "native-1",
      importedAt: "2026-09-02T00:00:00.000Z",
    };
    await sessions.upsert({ ...baseSession("first"), ...imported });

    await expect(
      sessions.upsert({ ...baseSession("second"), ...imported }),
    ).rejects.toThrow(/UNIQUE/);
  });
});

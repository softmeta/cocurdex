import { DatabaseSync } from "node:sqlite";
import {
  CURRENT_SCHEMA_VERSION,
  initializeDatabase,
} from "@cocurdex/db/internal/migrations";
import { seedHistoricalDatabase } from "@cocurdex/test-fixtures/database";
import { describe, expect, it } from "vitest";

const now = "2026-10-01T00:00:00.000Z";

function insertToolCall(
  database: DatabaseSync,
  id: string,
  content: unknown,
  rawOutput: unknown = null,
) {
  database
    .prepare(
      `INSERT INTO tool_calls (
         id, session_id, title, kind, status, content_json, raw_output_json,
         locations_json, started_at, updated_at
       ) VALUES (?, 'historical-session', ?, 'edit', 'completed', ?, ?, '[]', ?, ?)`,
    )
    .run(
      id,
      `Tool ${id}`,
      typeof content === "string" ? content : JSON.stringify(content),
      JSON.stringify(rawOutput),
      now,
      now,
    );
}

function contentOf(database: DatabaseSync, id: string) {
  const row = database
    .prepare("SELECT content_json FROM tool_calls WHERE id = ?")
    .get(id) as { content_json: string };
  return row.content_json;
}

function migrateFromVersion27(seed: (database: DatabaseSync) => void) {
  const database = new DatabaseSync(":memory:");
  seedHistoricalDatabase(database, 27, "/acme-shop");
  seed(database);
  initializeDatabase(database);
  return database;
}

describe("stored diff compaction migration", () => {
  it("replaces stored file contents with changed-line counts", () => {
    const fileBody = "line\n".repeat(5_000);
    const database = migrateFromVersion27((seed) => {
      insertToolCall(seed, "edit-1", [
        {
          type: "diff",
          path: "src/cart.ts",
          oldText: `${fileBody}total = 1\n`,
          newText: `${fileBody}total = 2\ntax = 0\n`,
        },
        { type: "text", text: "Edited src/cart.ts" },
      ]);
      insertToolCall(seed, "write-1", [
        { type: "diff", path: "src/new.ts", oldText: null, newText: "a\nb\n" },
      ]);
    });

    expect(database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: CURRENT_SCHEMA_VERSION,
    });
    expect(JSON.parse(contentOf(database, "edit-1"))).toEqual([
      { type: "diff", path: "src/cart.ts", additions: 2, deletions: 1 },
      { type: "text", text: "Edited src/cart.ts" },
    ]);
    expect(JSON.parse(contentOf(database, "write-1"))).toEqual([
      { type: "diff", path: "src/new.ts", additions: 2, deletions: 0 },
    ]);
  });

  it("leaves rows without diffs and unreadable content untouched", () => {
    const textContent = JSON.stringify([
      { type: "text", text: 'mentions "type":"diff" in output' },
    ]);
    const database = migrateFromVersion27((seed) => {
      insertToolCall(seed, "text-1", textContent, { stdout: "ok" });
      insertToolCall(seed, "broken-1", '{"type":"diff"');
    });

    expect(contentOf(database, "text-1")).toBe(textContent);
    expect(contentOf(database, "broken-1")).toBe('{"type":"diff"');
    expect(
      database
        .prepare("SELECT raw_output_json FROM tool_calls WHERE id = 'text-1'")
        .get(),
    ).toEqual({ raw_output_json: '{"stdout":"ok"}' });
  });

  it("drops patches from native evidence but keeps the turn's own patch", () => {
    const filesJson = JSON.stringify([
      { path: "a.ts", operation: "modify", reviewKind: "text", patch: "@@" },
    ]);
    const database = migrateFromVersion27((seed) => {
      seed
        .prepare(
          `INSERT INTO turn_change_sets (
             id, session_id, message_id, user_message_id, source, coverage,
             files_json, native_files_json, status, created_at, updated_at
           ) VALUES (
             'change-1', 'historical-session', 'historical-message',
             'historical-message', 'acp-tool-diff', 'tool-call', ?, ?,
             'ready', ?, ?
           )`,
        )
        .run(
          filesJson,
          JSON.stringify([
            {
              path: "a.ts",
              operation: "modify",
              beforeHash: "b1",
              afterHash: "a1",
              patch: "@@ -1 +1 @@",
            },
          ]),
          now,
          now,
        );
    });

    const row = database
      .prepare(
        "SELECT files_json, native_files_json FROM turn_change_sets WHERE id = 'change-1'",
      )
      .get() as { files_json: string; native_files_json: string };
    expect(row.files_json).toBe(filesJson);
    expect(JSON.parse(row.native_files_json)).toEqual([
      { path: "a.ts", operation: "modify", beforeHash: "b1", afterHash: "a1" },
    ]);
  });

  it("keeps sessions, messages, notes, and issues", () => {
    const database = migrateFromVersion27((seed) => {
      insertToolCall(seed, "edit-1", [
        { type: "diff", path: "a.ts", oldText: "x\n", newText: "y\n" },
      ]);
    });

    expect(database.prepare("SELECT id FROM sessions").all()).toEqual([
      { id: "historical-session" },
    ]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "Keep this conversation" },
    ]);
    expect(database.prepare("SELECT title FROM notes").all()).toEqual([
      { title: "Migration note" },
    ]);
    expect(database.prepare("SELECT title FROM issues").all()).toEqual([
      { title: "Migration issue" },
    ]);
  });
});

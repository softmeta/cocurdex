import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "./migrations";

describe("initializeDatabase", () => {
  it("adds permission_mode onto an existing sessions table", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        session_kind TEXT NOT NULL DEFAULT 'main',
        status TEXT NOT NULL,
        write_mode TEXT NOT NULL,
        collaboration_mode TEXT NOT NULL DEFAULT 'default',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    initializeDatabase(database);

    const columns = database.prepare("PRAGMA table_info(sessions)").all() as {
      name?: string;
    }[];
    expect(columns.map((column) => column.name)).toContain("permission_mode");
  });

  it("adds subagent_json onto an existing tool_calls table", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        locations_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    initializeDatabase(database);

    const columns = database.prepare("PRAGMA table_info(tool_calls)").all() as {
      name?: string;
    }[];
    expect(columns.map((column) => column.name)).toContain("subagent_json");
  });

  it("adds sort_order onto an existing workspaces table", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        `INSERT INTO workspaces (
           id, name, root_path, created_at, updated_at, last_opened_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "later",
        "later",
        "/tmp/later",
        "2026-04-20T10:00:00.000Z",
        "2026-04-20T10:00:00.000Z",
        "2026-04-20T10:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO workspaces (
           id, name, root_path, created_at, updated_at, last_opened_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "earlier",
        "earlier",
        "/tmp/earlier",
        "2026-04-20T09:00:00.000Z",
        "2026-04-20T09:00:00.000Z",
        "2026-04-20T09:00:00.000Z",
      );

    initializeDatabase(database);

    const rows = database
      .prepare("SELECT id, sort_order FROM workspaces ORDER BY sort_order ASC")
      .all() as { id?: string; sort_order?: number }[];
    expect(rows).toEqual([
      { id: "earlier", sort_order: 1000 },
      { id: "later", sort_order: 2000 },
    ]);
  });
});

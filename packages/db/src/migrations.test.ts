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
});

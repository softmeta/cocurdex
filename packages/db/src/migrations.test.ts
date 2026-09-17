import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  COCURDEX_APPLICATION_ID,
  CURRENT_SCHEMA_VERSION,
  FIRST_MIGRATABLE_SCHEMA_VERSION,
  initializeDatabase,
  UnsupportedDatabaseVersionError,
} from "./migrations";

function seedVersionFiveDatabase() {
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

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      session_kind TEXT NOT NULL DEFAULT 'main',
      parent_session_id TEXT,
      parent_tool_call_id TEXT,
      status TEXT NOT NULL,
      write_mode TEXT NOT NULL,
      collaboration_mode TEXT NOT NULL DEFAULT 'default',
      permission_mode TEXT,
      provider_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      archived_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    INSERT INTO workspaces (
      id, name, root_path, created_at, updated_at, last_opened_at
    ) VALUES (
      'workspace-1', 'repo-a', '/tmp/repo-a', '2026-08-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
    );

    INSERT INTO sessions (
      id, workspace_id, title, agent_type, status, write_mode,
      collaboration_mode, created_at, updated_at
    ) VALUES
      (
        'session-1', 'workspace-1', 'Plan the migration', 'codex', 'idle',
        'read-only', 'plan', '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z'
      ),
      (
        'session-2', 'workspace-1', 'Default mode', 'codex', 'idle',
        'read-only', 'default', '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z'
      );

    PRAGMA application_id = ${COCURDEX_APPLICATION_ID};
    PRAGMA user_version = 5;
  `);
  return database;
}

function tableShape(database: DatabaseSync, table: string) {
  return {
    columns: database
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => ({
        name: column.name,
        type: column.type,
        notNull: column.notnull,
        defaultValue: column.dflt_value,
        primaryKey: column.pk,
      })),
    indexes: database
      .prepare(`PRAGMA index_list(${table})`)
      .all()
      .map((index) => ({
        name: index.name,
        unique: index.unique,
        origin: index.origin,
      })),
  };
}

describe("initializeDatabase", () => {
  it("keeps workspaces and sessions when upgrading a version 5 database", () => {
    const database = seedVersionFiveDatabase();

    initializeDatabase(database);

    expect(
      database
        .prepare("SELECT id, name, root_paths, sort_order FROM workspaces")
        .all(),
    ).toEqual([
      {
        id: "workspace-1",
        name: "repo-a",
        root_paths: JSON.stringify(["/tmp/repo-a"]),
        sort_order: 1000,
      },
    ]);
    expect(
      database.prepare("SELECT id, session_mode_id FROM sessions").all(),
    ).toEqual([
      { id: "session-1", session_mode_id: "plan" },
      { id: "session-2", session_mode_id: null },
    ]);
  });

  it("keeps cascading session deletes after rebuilding workspaces", () => {
    const database = seedVersionFiveDatabase();

    initializeDatabase(database);
    database.exec("DELETE FROM workspaces WHERE id = 'workspace-1'");

    expect(
      database.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toEqual({ count: 0 });
  });

  it("rebuilds workspaces with the current schema and no legacy unique root path", () => {
    const migrated = seedVersionFiveDatabase();
    initializeDatabase(migrated);
    const fresh = new DatabaseSync(":memory:");
    initializeDatabase(fresh);

    expect(tableShape(migrated, "workspaces")).toEqual(
      tableShape(fresh, "workspaces"),
    );
    expect(
      migrated
        .prepare("PRAGMA foreign_key_list(notes)")
        .all()
        .map((row) => row.table),
    ).toContain("workspaces");
    expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE sql LIKE '%workspaces_migrated%'",
        )
        .all(),
    ).toEqual([]);
    expect(() =>
      migrated.exec(`
        INSERT INTO workspaces (
          id, name, root_paths, created_at, updated_at, last_opened_at,
          sort_order
        ) VALUES (
          'workspace-2', 'repo-b', '["/tmp/repo-a"]', '2026-08-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 2000
        )
      `),
    ).not.toThrow();
  });

  it("keeps an up-to-date database that carries a stale version marker", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.exec("CREATE TABLE legacy_sentinel (id TEXT)");
    database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION - 1}`);

    initializeDatabase(database);

    const sentinel = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_sentinel'",
      )
      .get();
    const version = database.prepare("PRAGMA user_version").get();
    expect(sentinel).toEqual({ name: "legacy_sentinel" });
    expect(version).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  });

  it("has a migration step for every supported schema version", () => {
    const unmigratable: number[] = [];
    for (
      let version = FIRST_MIGRATABLE_SCHEMA_VERSION;
      version < CURRENT_SCHEMA_VERSION;
      version++
    ) {
      const database = new DatabaseSync(":memory:");
      initializeDatabase(database);
      database.exec(`PRAGMA user_version = ${version}`);
      try {
        initializeDatabase(database);
      } catch {
        unmigratable.push(version);
      }
      database.close();
    }

    expect(unmigratable).toEqual([]);
  });

  it("refuses a database written by a newer schema version", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_paths TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        sort_order REAL NOT NULL DEFAULT 0
      );
    `);
    database.exec(`PRAGMA application_id = ${COCURDEX_APPLICATION_ID}`);
    database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);

    expect(() => initializeDatabase(database)).toThrow(
      UnsupportedDatabaseVersionError,
    );
  });

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
        session_mode_id TEXT,
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

  it("adds agent_role_id onto an existing sessions table", () => {
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
        session_mode_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    initializeDatabase(database);

    const columns = database.prepare("PRAGMA table_info(sessions)").all() as {
      name?: string;
    }[];
    expect(columns.map((column) => column.name)).toContain("agent_role_id");
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

  it("adds worktree_path onto an existing sessions table", () => {
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
        session_mode_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    initializeDatabase(database);

    const columns = database.prepare("PRAGMA table_info(sessions)").all() as {
      name?: string;
    }[];
    expect(columns.map((column) => column.name)).toContain("worktree_path");
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

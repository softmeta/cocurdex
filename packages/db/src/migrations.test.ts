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

function seedVersionElevenIssueDatabase() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const now = "2026-09-01T00:00:00.000Z";
  database.exec(`
    DROP TABLE issue_columns;
    CREATE TABLE issue_view_columns (
      view_id TEXT NOT NULL,
      field TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (view_id, field, id)
    );
    INSERT INTO issue_views (
      id, title, group_by, layout, created_at, updated_at
    ) VALUES
      ('project', 'Project view', 'status', 'board', '${now}', '${now}'),
      ('sprint', 'Sprint', 'status', 'board', '${now}', '${now}');
    INSERT INTO issue_view_columns VALUES
      ('project', 'status', 'backlog', 'Inbox', NULL, 0, '${now}', '${now}'),
      ('project', 'status', 'done', 'Done', NULL, 1000, '${now}', '${now}'),
      ('project', 'priority', 'none', 'No priority', NULL, 0, '${now}', '${now}'),
      ('sprint', 'status', 'backlog', 'Backlog', NULL, 0, '${now}', '${now}'),
      ('sprint', 'status', 'col-blocked', 'Blocked', NULL, 500, '${now}', '${now}');
    INSERT INTO issues (
      id, title, status, priority, created_at, updated_at
    ) VALUES
      ('issue-blocked', 'Blocked work', 'col-blocked', 'none', '${now}', '${now}'),
      ('issue-orphan', 'Deleted column', 'col-gone', 'urgent', '${now}', '${now}'),
      ('issue-done', 'Shipped', 'done', 'none', '${now}', '${now}');
    INSERT INTO notes (
      id, kind, title, body_markdown, sort_order, created_at, updated_at
    ) VALUES ('note-1', 'note', 'Kept', 'Body', 0, '${now}', '${now}');
    PRAGMA user_version = 11;
  `);
  return database;
}

function seedVersionTwelveTeamDatabase() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const now = "2026-10-01T00:00:00.000Z";
  database.exec(`
    ALTER TABLE issues ADD COLUMN assignee_session_id TEXT;
    ALTER TABLE teams ADD COLUMN issue_view_id TEXT NOT NULL DEFAULT '';
    DROP TABLE team_tasks;
    CREATE TABLE team_tasks (
      team_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      blocked_by_json TEXT NOT NULL,
      evidence TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_id, issue_id)
    );
    INSERT INTO workspaces (
      id, name, root_paths, created_at, updated_at, last_opened_at
    ) VALUES ('w-1', 'repo', '["/tmp/repo"]', '${now}', '${now}', '${now}');
    INSERT INTO sessions (
      id, workspace_id, title, agent_type, status, write_mode, created_at,
      updated_at
    ) VALUES (
      'lead', 'w-1', 'Lead', 'codex', 'idle', 'native-write', '${now}', '${now}'
    );
    INSERT INTO issue_views (
      id, title, group_by, layout, created_at, updated_at
    ) VALUES
      ('project', 'Project view', 'status', 'board', '${now}', '${now}'),
      ('view-team', 'team:lead', 'status', 'board', '${now}', '${now}');
    INSERT INTO teams (
      id, lead_session_id, workspace_id, issue_view_id, status, created_at,
      updated_at
    ) VALUES ('team-1', 'lead', 'w-1', 'view-team', 'active', '${now}', '${now}');
    INSERT INTO issues (
      id, title, description_markdown, status, priority, assignee_session_id,
      created_at, updated_at
    ) VALUES
      ('task-design', 'Design', 'Write it down', 'review', 'none', 'lead',
       '${now}', '${now}'),
      ('task-build', 'Build', '', 'backlog', 'none', NULL, '${now}', '${now}'),
      ('user-issue', 'Ship billing', '', 'backlog', 'none', NULL,
       '${now}', '${now}');
    INSERT INTO team_tasks VALUES
      ('team-1', 'task-design', '[]', 'tests pass', '${now}'),
      ('team-1', 'task-build', '["task-design"]', NULL, '${now}');
    INSERT INTO notes (
      id, kind, title, body_markdown, sort_order, created_at, updated_at
    ) VALUES ('note-1', 'note', 'Kept', 'Body', 0, '${now}', '${now}');
    PRAGMA user_version = 12;
  `);
  return database;
}

describe("initializeDatabase", () => {
  it("moves agent team tasks out of issues and keeps user data", () => {
    const database = seedVersionTwelveTeamDatabase();

    initializeDatabase(database);

    expect(
      database
        .prepare(
          `SELECT id, team_id, title, description, status,
             assignee_session_id, blocked_by_json, evidence
           FROM team_tasks ORDER BY id`,
        )
        .all(),
    ).toEqual([
      {
        id: "task-build",
        team_id: "team-1",
        title: "Build",
        description: null,
        status: "backlog",
        assignee_session_id: null,
        blocked_by_json: '["task-design"]',
        evidence: null,
      },
      {
        id: "task-design",
        team_id: "team-1",
        title: "Design",
        description: "Write it down",
        status: "review",
        assignee_session_id: "lead",
        blocked_by_json: "[]",
        evidence: "tests pass",
      },
    ]);
    expect(database.prepare("SELECT id FROM issues ORDER BY id").all()).toEqual(
      [{ id: "task-build" }, { id: "task-design" }, { id: "user-issue" }],
    );
    expect(
      database.prepare("SELECT id FROM issue_views ORDER BY id").all(),
    ).toEqual([{ id: "project" }]);
    expect(database.prepare("SELECT id, status FROM teams").all()).toEqual([
      { id: "team-1", status: "active" },
    ]);
    expect(
      database.prepare("SELECT id, body_markdown FROM notes").all(),
    ).toEqual([{ id: "note-1", body_markdown: "Body" }]);
    expect(database.prepare("SELECT id FROM sessions").all()).toEqual([
      { id: "lead" },
    ]);
    expect(
      tableShape(database, "issues").columns.map((c) => c.name),
    ).not.toContain("assignee_session_id");
    expect(
      tableShape(database, "teams").columns.map((c) => c.name),
    ).not.toContain("issue_view_id");
  });

  it("merges per-view issue columns into one global set", () => {
    const database = seedVersionElevenIssueDatabase();

    initializeDatabase(database);

    expect(
      database
        .prepare(
          "SELECT field, id, title FROM issue_columns ORDER BY field, sort_order",
        )
        .all(),
    ).toEqual([
      { field: "priority", id: "none", title: "No priority" },
      { field: "status", id: "backlog", title: "Inbox" },
      { field: "status", id: "done", title: "Done" },
      { field: "status", id: "col-blocked", title: "Blocked" },
    ]);
    expect(
      database
        .prepare("SELECT id, title, status, priority FROM issues ORDER BY id")
        .all(),
    ).toEqual([
      {
        id: "issue-blocked",
        title: "Blocked work",
        status: "col-blocked",
        priority: "none",
      },
      { id: "issue-done", title: "Shipped", status: "done", priority: "none" },
      {
        id: "issue-orphan",
        title: "Deleted column",
        status: "backlog",
        priority: "none",
      },
    ]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'issue_view_columns'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT id, body_markdown FROM notes").all(),
    ).toEqual([{ id: "note-1", body_markdown: "Body" }]);
  });

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

  it("moves built-in ACP agent ids onto their registry ids and keeps the rows", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const now = "2026-10-05T00:00:00.000Z";
    database.exec(`
      INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
      VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
      INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, provider_snapshot_json, created_at, updated_at)
      VALUES
        ('s-grok', 'w1', 'Grok work', 'grok-build', 'idle', 'native-write',
         '{"providerId":"grok-build","modelId":"grok-4.6"}', '${now}', '${now}'),
        ('s-codex', 'w1', 'Codex work', 'codex', 'idle', 'read-only',
         '{"providerId":"codex","modelId":"gpt-5.5"}', '${now}', '${now}');
      INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
      VALUES ('m1', 's-grok', 'user', 'hello', '[]', '${now}');
      INSERT INTO agent_roles (id, name, agent_id, provider_id, created_at, updated_at)
      VALUES ('r1', 'Reviewer', 'devin', 'devin', '${now}', '${now}');
      INSERT INTO agent_provider_defaults (agent_id, provider_id, model_id, created_at, updated_at)
      VALUES ('cursor', 'cursor', 'auto', '${now}', '${now}');
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES ('commitMessageModel', '{"agentId":"grok-build","providerId":"grok-build","modelId":"grok-4.6"}', '${now}');
    `);
    database.exec(`PRAGMA user_version = 13`);

    initializeDatabase(database);

    expect(
      database
        .prepare(
          "SELECT id, agent_type, json_extract(provider_snapshot_json, '$.providerId') AS provider FROM sessions ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: "s-codex", agent_type: "codex", provider: "codex" },
      {
        id: "s-grok",
        agent_type: "acp:grok-build",
        provider: "acp:grok-build",
      },
    ]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "hello" },
    ]);
    expect(
      database.prepare("SELECT agent_id, provider_id FROM agent_roles").get(),
    ).toEqual({ agent_id: "acp:devin", provider_id: "acp:devin" });
    expect(
      database
        .prepare("SELECT agent_id, provider_id FROM agent_provider_defaults")
        .get(),
    ).toEqual({ agent_id: "acp:cursor", provider_id: "acp:cursor" });
    expect(
      JSON.parse(
        (
          database
            .prepare(
              "SELECT value_json FROM app_settings WHERE key = 'commitMessageModel'",
            )
            .get() as { value_json: string }
        ).value_json,
      ),
    ).toEqual({
      agentId: "acp:grok-build",
      providerId: "acp:grok-build",
      modelId: "grok-4.6",
    });
  });

  it("adds avatar_json to agent roles from version 14 and keeps user data", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.exec("ALTER TABLE agent_roles DROP COLUMN avatar_json");
    const now = "2026-10-06T00:00:00.000Z";
    database.exec(`
      INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
      VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
      INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, agent_role_id, created_at, updated_at)
      VALUES ('s1', 'w1', 'Role work', 'pi', 'idle', 'read-only', 'r1', '${now}', '${now}');
      INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
      VALUES ('m1', 's1', 'user', 'hello', '[]', '${now}');
      INSERT INTO notes (id, kind, title, body_markdown, created_at, updated_at)
      VALUES ('n1', 'note', 'Spec', 'body', '${now}', '${now}');
      INSERT INTO issues (id, title, workspace_id, created_at, updated_at)
      VALUES ('i1', 'Ship avatars', 'w1', '${now}', '${now}');
      INSERT INTO agent_roles (id, name, agent_id, model_id, skill_ids_json, created_at, updated_at)
      VALUES ('r1', 'Reviewer', 'pi', 'deepseek', '["review"]', '${now}', '${now}');
      PRAGMA user_version = 14;
    `);

    initializeDatabase(database);

    expect(
      database
        .prepare(
          "SELECT id, name, model_id, skill_ids_json, avatar_json FROM agent_roles",
        )
        .all(),
    ).toEqual([
      {
        id: "r1",
        name: "Reviewer",
        model_id: "deepseek",
        skill_ids_json: '["review"]',
        avatar_json: null,
      },
    ]);
    expect(
      database.prepare("SELECT id, agent_role_id FROM sessions").all(),
    ).toEqual([{ id: "s1", agent_role_id: "r1" }]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "hello" },
    ]);
    expect(database.prepare("SELECT title FROM notes").all()).toEqual([
      { title: "Spec" },
    ]);
    expect(database.prepare("SELECT title FROM issues").all()).toEqual([
      { title: "Ship avatars" },
    ]);
    expect(database.prepare("SELECT name FROM workspaces").all()).toEqual([
      { name: "Repo" },
    ]);
  });

  it("adds description to agent roles from version 15 and keeps user data", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.exec("ALTER TABLE agent_roles DROP COLUMN description");
    const now = "2026-10-06T00:00:00.000Z";
    database.exec(`
      INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
      VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
      INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, agent_role_id, created_at, updated_at)
      VALUES ('s1', 'w1', 'Role work', 'pi', 'idle', 'read-only', 'r1', '${now}', '${now}');
      INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
      VALUES ('m1', 's1', 'user', 'hello', '[]', '${now}');
      INSERT INTO notes (id, kind, title, body_markdown, created_at, updated_at)
      VALUES ('n1', 'note', 'Spec', 'body', '${now}', '${now}');
      INSERT INTO issues (id, title, workspace_id, created_at, updated_at)
      VALUES ('i1', 'Describe roles', 'w1', '${now}', '${now}');
      INSERT INTO agent_roles (id, name, agent_id, model_id, avatar_json, created_at, updated_at)
      VALUES ('r1', 'Reviewer', 'pi', 'deepseek', '{"kind":"initial","color":"red"}', '${now}', '${now}');
      PRAGMA user_version = 15;
    `);

    initializeDatabase(database);

    expect(
      database
        .prepare("SELECT id, name, avatar_json, description FROM agent_roles")
        .all(),
    ).toEqual([
      {
        id: "r1",
        name: "Reviewer",
        avatar_json: '{"kind":"initial","color":"red"}',
        description: null,
      },
    ]);
    expect(
      database.prepare("SELECT id, agent_role_id FROM sessions").all(),
    ).toEqual([{ id: "s1", agent_role_id: "r1" }]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "hello" },
    ]);
    expect(database.prepare("SELECT title FROM notes").all()).toEqual([
      { title: "Spec" },
    ]);
    expect(database.prepare("SELECT title FROM issues").all()).toEqual([
      { title: "Describe roles" },
    ]);
  });

  it("drops the standalone chat tables from version 16 and keeps user data", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const now = "2026-10-07T00:00:00.000Z";
    database.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at)
      VALUES ('c1', 'Old chat', 'openai', 'gpt-5', '${now}', '${now}');
      INSERT INTO conversation_messages (id, conversation_id, role, content_json, status, created_at, updated_at)
      VALUES ('cm1', 'c1', 'user', '[]', 'completed', '${now}', '${now}');
      INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
      VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
      INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, created_at, updated_at)
      VALUES ('s1', 'w1', 'Agent work', 'pi', 'idle', 'read-only', '${now}', '${now}');
      INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
      VALUES ('m1', 's1', 'user', 'hello', '[]', '${now}');
      INSERT INTO notes (id, kind, title, body_markdown, created_at, updated_at)
      VALUES ('n1', 'note', 'Spec', 'body', '${now}', '${now}');
      INSERT INTO issues (id, title, workspace_id, created_at, updated_at)
      VALUES ('i1', 'Chat on pi', 'w1', '${now}', '${now}');
      PRAGMA user_version = 16;
    `);

    initializeDatabase(database);

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'conversation%'",
        )
        .all(),
    ).toEqual([]);
    expect(database.prepare("SELECT title FROM sessions").all()).toEqual([
      { title: "Agent work" },
    ]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "hello" },
    ]);
    expect(database.prepare("SELECT title FROM notes").all()).toEqual([
      { title: "Spec" },
    ]);
    expect(database.prepare("SELECT title FROM issues").all()).toEqual([
      { title: "Chat on pi" },
    ]);
  });

  it("adds roster_json to teams from version 17 and keeps user data", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.exec("ALTER TABLE teams DROP COLUMN roster_json");
    const now = "2026-10-07T00:00:00.000Z";
    database.exec(`
      INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
      VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
      INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, created_at, updated_at)
      VALUES ('s1', 'w1', 'Lead', 'codex', 'idle', 'read-only', '${now}', '${now}');
      INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
      VALUES ('m1', 's1', 'user', 'hello', '[]', '${now}');
      INSERT INTO notes (id, kind, title, body_markdown, created_at, updated_at)
      VALUES ('n1', 'note', 'Spec', 'body', '${now}', '${now}');
      INSERT INTO issues (id, title, workspace_id, created_at, updated_at)
      VALUES ('i1', 'Roster teams', 'w1', '${now}', '${now}');
      INSERT INTO teams (id, lead_session_id, workspace_id, status, created_at, updated_at)
      VALUES ('t1', 's1', 'w1', 'active', '${now}', '${now}');
      PRAGMA user_version = 17;
    `);

    initializeDatabase(database);

    expect(
      database
        .prepare("SELECT id, lead_session_id, status, roster_json FROM teams")
        .all(),
    ).toEqual([
      {
        id: "t1",
        lead_session_id: "s1",
        status: "active",
        roster_json: null,
      },
    ]);
    expect(database.prepare("SELECT title FROM sessions").all()).toEqual([
      { title: "Lead" },
    ]);
    expect(database.prepare("SELECT content FROM messages").all()).toEqual([
      { content: "hello" },
    ]);
    expect(database.prepare("SELECT title FROM notes").all()).toEqual([
      { title: "Spec" },
    ]);
    expect(database.prepare("SELECT title FROM issues").all()).toEqual([
      { title: "Roster teams" },
    ]);
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

  it("adds actions_json while keeping worktree scripts from version 10", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.exec(`
      ALTER TABLE workspace_worktree_environments DROP COLUMN actions_json;
      INSERT INTO workspaces (
        id, name, root_paths, created_at, updated_at, last_opened_at
      ) VALUES (
        'workspace-1', 'repo', '["/tmp/repo"]', '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
      );
      INSERT INTO workspace_worktree_environments (
        workspace_id, setup_script, cleanup_script, updated_at
      ) VALUES (
        'workspace-1', 'pnpm install', 'rm -rf .turbo',
        '2026-09-01T00:00:00.000Z'
      );
      PRAGMA user_version = 10;
    `);

    initializeDatabase(database);

    expect(
      database
        .prepare(
          "SELECT workspace_id, setup_script, cleanup_script, actions_json FROM workspace_worktree_environments",
        )
        .all()
        .map((row) => ({ ...row })),
    ).toEqual([
      {
        workspace_id: "workspace-1",
        setup_script: "pnpm install",
        cleanup_script: "rm -rf .turbo",
        actions_json: "[]",
      },
    ]);
    expect(
      database
        .prepare("SELECT id FROM workspaces")
        .all()
        .map((row) => row.id),
    ).toEqual(["workspace-1"]);
  });
});

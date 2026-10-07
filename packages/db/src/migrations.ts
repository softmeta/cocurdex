import type { DatabaseSync } from "node:sqlite";
import { createSchemaSql } from "./schema";
import { createTeamSchemaSql } from "./team/schema";
import { ensureTimelineSequence } from "./timeline-sequence";

/** ASCII "COCU" marks databases owned by the current Cocurdex baseline. */
export const COCURDEX_APPLICATION_ID = 0x434f4355;
export const FIRST_MIGRATABLE_SCHEMA_VERSION = 5;
export const CURRENT_SCHEMA_VERSION = 17;

interface PragmaNumberRow {
  application_id?: number;
  user_version?: number;
}

interface TableCountRow {
  count?: number;
}

interface DatabaseState {
  applicationId: number;
  schemaVersion: number;
  tableCount: number;
}

export class UnsupportedDatabaseVersionError extends Error {
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(
      `Cocurdex database schema version ${schemaVersion} is newer than the supported version ${CURRENT_SCHEMA_VERSION}`,
    );
    this.name = "UnsupportedDatabaseVersionError";
    this.schemaVersion = schemaVersion;
  }
}

function readDatabaseState(database: DatabaseSync): DatabaseState {
  const applicationId = database.prepare("PRAGMA application_id").get() as
    | PragmaNumberRow
    | undefined;
  const userVersion = database.prepare("PRAGMA user_version").get() as
    | PragmaNumberRow
    | undefined;
  const tableCount = database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get() as TableCountRow | undefined;

  return {
    applicationId: applicationId?.application_id ?? 0,
    schemaVersion: userVersion?.user_version ?? 0,
    tableCount: tableCount?.count ?? 0,
  };
}

export function shouldRecreateDatabase(database: DatabaseSync): boolean {
  const { applicationId, tableCount } = readDatabaseState(database);
  if (tableCount === 0) {
    return false;
  }
  return applicationId !== COCURDEX_APPLICATION_ID;
}

interface TableInfoRow {
  name?: string;
}

function hasColumn(database: DatabaseSync, table: string, column: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as
    | TableInfoRow[]
    | undefined;
  return Boolean(columns?.some((entry) => entry.name === column));
}

type MigrationStep = (database: DatabaseSync) => void;

function migrateWorkspacesToRootPaths(database: DatabaseSync): void {
  if (!hasColumn(database, "workspaces", "root_path")) {
    return;
  }
  database.exec(`
    CREATE TABLE workspaces_migrated (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_paths TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL,
      sort_order REAL NOT NULL DEFAULT 0
    )
  `);
  database.exec(`
    INSERT INTO workspaces_migrated (
      id, name, root_paths, created_at, updated_at, last_opened_at, sort_order
    )
    SELECT
      id, name, json_array(root_path), created_at, updated_at, last_opened_at,
      sort_order
    FROM workspaces
  `);
  database.exec("DROP TABLE workspaces");
  database.exec("ALTER TABLE workspaces_migrated RENAME TO workspaces");
}

function migrateCollaborationModeToSessionModeId(database: DatabaseSync): void {
  for (const table of ["sessions", "agent_roles"]) {
    if (!hasColumn(database, table, "collaboration_mode")) {
      continue;
    }
    if (!hasColumn(database, table, "session_mode_id")) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN session_mode_id TEXT`);
    }
    database.exec(
      `UPDATE ${table} SET session_mode_id = 'plan'
       WHERE collaboration_mode = 'plan' AND session_mode_id IS NULL`,
    );
    database.exec(`ALTER TABLE ${table} DROP COLUMN collaboration_mode`);
  }
}

function migrateWorktreeEnvironmentProposals(database: DatabaseSync): void {
  for (const column of [
    "proposed_setup_script",
    "proposed_cleanup_script",
    "proposed_rationale",
    "proposed_at",
  ]) {
    if (!hasColumn(database, "workspace_worktree_environments", column)) {
      database.exec(
        `ALTER TABLE workspace_worktree_environments ADD COLUMN ${column} TEXT`,
      );
    }
  }
}

function migratePendingSettingsChanges(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_settings_changes (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

function migrateWorkspaceActions(database: DatabaseSync): void {
  if (!hasColumn(database, "workspace_worktree_environments", "actions_json")) {
    database.exec(
      "ALTER TABLE workspace_worktree_environments ADD COLUMN actions_json TEXT NOT NULL DEFAULT '[]'",
    );
  }
}

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

interface LegacyIssueColumnRow {
  view_id: string;
  field: string;
  id: string;
  title: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_ISSUE_VIEW_ID = "project";

function migrateIssueColumnsToGlobal(database: DatabaseSync): void {
  if (!tableExists(database, "issue_view_columns")) {
    return;
  }
  const rows = database
    .prepare(
      `SELECT c.*
       FROM issue_view_columns c
       LEFT JOIN issue_views v ON v.id = c.view_id
       ORDER BY c.view_id = ? DESC, v.created_at, c.view_id, c.sort_order, c.id`,
    )
    .all(DEFAULT_ISSUE_VIEW_ID) as unknown as LegacyIssueColumnRow[];
  const insert = database.prepare(
    `INSERT INTO issue_columns (
       field, id, title, color, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(field, id) DO NOTHING`,
  );
  const maxOrder = database.prepare(
    "SELECT COALESCE(MAX(sort_order), -1000) AS sort_order FROM issue_columns WHERE field = ?",
  );
  for (const row of rows) {
    const sortOrder =
      row.view_id === DEFAULT_ISSUE_VIEW_ID
        ? row.sort_order
        : (maxOrder.get(row.field) as { sort_order: number }).sort_order + 1000;
    insert.run(
      row.field,
      row.id,
      row.title,
      row.color,
      sortOrder,
      row.created_at,
      row.updated_at,
    );
  }
  database.exec("DROP TABLE issue_view_columns");
  repointOrphanIssueValues(database);
}

function repointOrphanIssueValues(database: DatabaseSync): void {
  for (const [field, fallbackSql] of [
    [
      "status",
      "SELECT id FROM issue_columns WHERE field = 'status' ORDER BY sort_order, id LIMIT 1",
    ],
    [
      "priority",
      `SELECT id FROM issue_columns WHERE field = 'priority'
       ORDER BY id = 'none' DESC, sort_order DESC, id LIMIT 1`,
    ],
  ] as const) {
    const fallback = database.prepare(fallbackSql).get() as
      | { id: string }
      | undefined;
    if (!fallback) {
      continue;
    }
    database
      .prepare(
        `UPDATE issues SET ${field} = ?
         WHERE ${field} NOT IN (
           SELECT id FROM issue_columns WHERE field = '${field}'
         )`,
      )
      .run(fallback.id);
  }
}

function migrateTeamTasksOffIssues(database: DatabaseSync): void {
  if (hasColumn(database, "team_tasks", "issue_id")) {
    const assignee = hasColumn(database, "issues", "assignee_session_id")
      ? "i.assignee_session_id"
      : "NULL";
    database.exec("ALTER TABLE team_tasks RENAME TO team_tasks_legacy");
    database.exec(createTeamSchemaSql());
    database.exec(
      `INSERT OR IGNORE INTO team_tasks (
         id, team_id, title, description, status, assignee_session_id,
         blocked_by_json, evidence, revision, created_at, updated_at
       )
       SELECT i.id, l.team_id, i.title, NULLIF(i.description_markdown, ''),
         CASE WHEN i.status IN ('backlog', 'doing', 'review', 'done')
           THEN i.status ELSE 'backlog' END,
         ${assignee}, l.blocked_by_json, l.evidence, 1, i.created_at,
         l.updated_at
       FROM team_tasks_legacy l
       JOIN issues i ON i.id = l.issue_id`,
    );
    database.exec("DROP TABLE team_tasks_legacy");
  }
  if (hasColumn(database, "teams", "issue_view_id")) {
    database
      .prepare(
        `DELETE FROM issue_views
         WHERE id != ? AND id IN (SELECT issue_view_id FROM teams)`,
      )
      .run(DEFAULT_ISSUE_VIEW_ID);
    database.exec("ALTER TABLE teams DROP COLUMN issue_view_id");
  }
  if (hasColumn(database, "issues", "assignee_session_id")) {
    database.exec("ALTER TABLE issues DROP COLUMN assignee_session_id");
  }
}

const ACP_AGENT_IDS_MOVED_TO_REGISTRY = ["cursor", "devin", "grok-build"];

function hasTable(database: DatabaseSync, table: string) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function migrateAcpAgentIdsToRegistry(database: DatabaseSync): void {
  const ids = ACP_AGENT_IDS_MOVED_TO_REGISTRY.map((id) => `'${id}'`).join(", ");
  const renameColumn = (table: string, column: string) => {
    if (hasTable(database, table) && hasColumn(database, table, column)) {
      database.exec(
        `UPDATE ${table} SET ${column} = 'acp:' || ${column} WHERE ${column} IN (${ids})`,
      );
    }
  };
  const renameJsonField = (table: string, column: string, field: string) => {
    if (!hasTable(database, table) || !hasColumn(database, table, column)) {
      return;
    }
    database.exec(
      `UPDATE ${table}
       SET ${column} = json_set(${column}, '$.${field}', 'acp:' || json_extract(${column}, '$.${field}'))
       WHERE json_valid(${column}) AND json_extract(${column}, '$.${field}') IN (${ids})`,
    );
  };

  renameColumn("sessions", "agent_type");
  renameJsonField("sessions", "provider_snapshot_json", "providerId");
  renameColumn("agent_roles", "agent_id");
  renameColumn("agent_roles", "provider_id");
  renameColumn("agent_provider_defaults", "agent_id");
  renameColumn("agent_provider_defaults", "provider_id");
  renameJsonField("workflow_attempts", "executor_binding_json", "agentId");
  for (const field of ["agentId", "providerId"]) {
    if (hasTable(database, "app_settings")) {
      database.exec(
        `UPDATE app_settings
         SET value_json = json_set(value_json, '$.${field}', 'acp:' || json_extract(value_json, '$.${field}'))
         WHERE key IN ('commitMessageModel', 'titleModel')
           AND json_valid(value_json)
           AND json_extract(value_json, '$.${field}') IN (${ids})`,
      );
    }
  }
  if (hasTable(database, "agent_capability_cache")) {
    database.exec(
      `DELETE FROM agent_capability_cache WHERE agent_id IN (${ids})`,
    );
  }
}

function migrateAgentRoleAvatars(database: DatabaseSync): void {
  if (
    hasTable(database, "agent_roles") &&
    !hasColumn(database, "agent_roles", "avatar_json")
  ) {
    database.exec("ALTER TABLE agent_roles ADD COLUMN avatar_json TEXT");
  }
}

function migrateAgentRoleDescriptions(database: DatabaseSync): void {
  if (
    hasTable(database, "agent_roles") &&
    !hasColumn(database, "agent_roles", "description")
  ) {
    database.exec("ALTER TABLE agent_roles ADD COLUMN description TEXT");
  }
}

function dropStandaloneChatTables(database: DatabaseSync): void {
  database.exec("DROP TABLE IF EXISTS conversation_messages");
  database.exec("DROP TABLE IF EXISTS conversations");
}

const MIGRATION_STEPS = new Map<number, MigrationStep>([
  [5, migrateWorkspacesToRootPaths],
  [6, migrateCollaborationModeToSessionModeId],
  [7, migrateWorktreeEnvironmentProposals],
  [8, migratePendingSettingsChanges],
  [9, ensureTimelineSequence],
  [10, migrateWorkspaceActions],
  [11, migrateIssueColumnsToGlobal],
  [12, migrateTeamTasksOffIssues],
  [13, migrateAcpAgentIdsToRegistry],
  [14, migrateAgentRoleAvatars],
  [15, migrateAgentRoleDescriptions],
  [16, dropStandaloneChatTables],
]);

function runMigrationStep(database: DatabaseSync, step: MigrationStep): void {
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN");
  try {
    step(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function isCocurdexDatabase(state: DatabaseState): boolean {
  return (
    state.tableCount > 0 && state.applicationId === COCURDEX_APPLICATION_ID
  );
}

export function hasPendingMigration(database: DatabaseSync): boolean {
  const state = readDatabaseState(database);
  return (
    isCocurdexDatabase(state) && state.schemaVersion < CURRENT_SCHEMA_VERSION
  );
}

function migrateDatabase(database: DatabaseSync, state: DatabaseState): void {
  if (!isCocurdexDatabase(state)) {
    return;
  }
  for (
    let version = state.schemaVersion;
    version < CURRENT_SCHEMA_VERSION;
    version++
  ) {
    const step = MIGRATION_STEPS.get(version);
    if (!step) {
      throw new Error(
        `Missing Cocurdex migration from schema version ${version}`,
      );
    }
    runMigrationStep(database, step);
  }
}

export function initializeDatabase(database: DatabaseSync): void {
  const state = readDatabaseState(database);
  if (
    isCocurdexDatabase(state) &&
    state.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new UnsupportedDatabaseVersionError(state.schemaVersion);
  }
  database.exec(createSchemaSql());
  // Additive: existing same-version DBs keep CREATE TABLE IF NOT EXISTS,
  // so the permission axis has to be patched onto the live sessions table.
  if (!hasColumn(database, "sessions", "permission_mode")) {
    database.exec("ALTER TABLE sessions ADD COLUMN permission_mode TEXT");
  }
  if (!hasColumn(database, "sessions", "agent_role_id")) {
    database.exec("ALTER TABLE sessions ADD COLUMN agent_role_id TEXT");
  }
  if (!hasColumn(database, "tool_calls", "subagent_json")) {
    database.exec("ALTER TABLE tool_calls ADD COLUMN subagent_json TEXT");
  }
  if (!hasColumn(database, "agent_roles", "model_name")) {
    database.exec("ALTER TABLE agent_roles ADD COLUMN model_name TEXT");
  }
  if (!hasColumn(database, "sessions", "worktree_path")) {
    database.exec("ALTER TABLE sessions ADD COLUMN worktree_path TEXT");
  }
  if (!hasColumn(database, "sessions", "peer_inbound")) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN peer_inbound TEXT NOT NULL DEFAULT 'deliver'",
    );
  }
  if (!hasColumn(database, "messages", "origin_json")) {
    database.exec("ALTER TABLE messages ADD COLUMN origin_json TEXT");
  }
  for (const column of [
    "proposed_setup_script",
    "proposed_cleanup_script",
    "proposed_rationale",
    "proposed_at",
  ]) {
    if (!hasColumn(database, "workspace_worktree_environments", column)) {
      database.exec(
        `ALTER TABLE workspace_worktree_environments ADD COLUMN ${column} TEXT`,
      );
    }
  }
  if (!hasColumn(database, "workspaces", "sort_order")) {
    database.exec(
      "ALTER TABLE workspaces ADD COLUMN sort_order REAL NOT NULL DEFAULT 0",
    );
    const rows = database
      .prepare("SELECT id FROM workspaces ORDER BY created_at ASC, id ASC")
      .all() as { id?: string }[];
    const update = database.prepare(
      "UPDATE workspaces SET sort_order = ? WHERE id = ?",
    );
    for (const [index, row] of rows.entries()) {
      if (row.id) {
        update.run((index + 1) * 1000, row.id);
      }
    }
  }

  migrateDatabase(database, state);
  runMigrationStep(database, ensureTimelineSequence);

  database.exec(`PRAGMA application_id = ${COCURDEX_APPLICATION_ID}`);
  database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}

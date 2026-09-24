import type { DatabaseSync } from "node:sqlite";
import { createSchemaSql } from "./schema";

/** ASCII "COCU" marks databases owned by the current Cocurdex baseline. */
export const COCURDEX_APPLICATION_ID = 0x434f4355;
export const FIRST_MIGRATABLE_SCHEMA_VERSION = 5;
export const CURRENT_SCHEMA_VERSION = 9;

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

const MIGRATION_STEPS = new Map<number, MigrationStep>([
  [5, migrateWorkspacesToRootPaths],
  [6, migrateCollaborationModeToSessionModeId],
  [7, migrateWorktreeEnvironmentProposals],
  [8, migratePendingSettingsChanges],
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
  if (!hasColumn(database, "issues", "assignee_session_id")) {
    database.exec("ALTER TABLE issues ADD COLUMN assignee_session_id TEXT");
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

  database.exec(`PRAGMA application_id = ${COCURDEX_APPLICATION_ID}`);
  database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}

import type { DatabaseSync } from "node:sqlite";
import { createSchemaSql } from "./schema";

/** ASCII "COCU" marks databases owned by the current Cocurdex baseline. */
export const COCURDEX_APPLICATION_ID = 0x434f4355;
export const CURRENT_SCHEMA_VERSION = 5;

interface PragmaNumberRow {
  application_id?: number;
  user_version?: number;
}

interface TableCountRow {
  count?: number;
}

export function shouldRecreateDatabase(database: DatabaseSync): boolean {
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

  if ((tableCount?.count ?? 0) === 0) {
    return false;
  }

  return (
    applicationId?.application_id !== COCURDEX_APPLICATION_ID ||
    userVersion?.user_version !== CURRENT_SCHEMA_VERSION
  );
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

export function initializeDatabase(database: DatabaseSync): void {
  database.exec(createSchemaSql());
  // Additive: existing same-version DBs keep CREATE TABLE IF NOT EXISTS,
  // so the permission axis has to be patched onto the live sessions table.
  if (!hasColumn(database, "sessions", "permission_mode")) {
    database.exec("ALTER TABLE sessions ADD COLUMN permission_mode TEXT");
  }
  database.exec(`PRAGMA application_id = ${COCURDEX_APPLICATION_ID}`);
  database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}

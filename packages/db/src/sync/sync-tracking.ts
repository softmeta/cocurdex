import type { DatabaseSync } from "node:sqlite";

export const SYNC_TRACKED_TABLES = [
  "sessions",
  "messages",
  "tool_calls",
  "turn_change_sets",
  "message_turn_stats",
] as const;

export type SyncTrackedTable = (typeof SYNC_TRACKED_TABLES)[number];

const TOMBSTONED_ENTITIES: Record<
  string,
  { entity: string; idColumn: string; sessionColumn: string }
> = {
  sessions: { entity: "session", idColumn: "id", sessionColumn: "id" },
  messages: { entity: "message", idColumn: "id", sessionColumn: "session_id" },
  turn_change_sets: {
    entity: "turnChangeSet",
    idColumn: "id",
    sessionColumn: "session_id",
  },
};

const NEXT_SEQ = "(SELECT seq FROM sync_clock WHERE id = 1)";
const BUMP_CLOCK = "UPDATE sync_clock SET seq = seq + 1 WHERE id = 1;";

function hasColumn(database: DatabaseSync, table: string, column: string) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

function stampTriggers(table: SyncTrackedTable) {
  const stamp = `UPDATE ${table} SET change_seq = ${NEXT_SEQ} WHERE rowid = NEW.rowid;`;
  return `
    CREATE TRIGGER IF NOT EXISTS sync_${table}_inserted AFTER INSERT ON ${table}
    BEGIN
      ${BUMP_CLOCK}
      ${stamp}
    END;
    CREATE TRIGGER IF NOT EXISTS sync_${table}_updated AFTER UPDATE ON ${table}
    WHEN NEW.change_seq IS OLD.change_seq
    BEGIN
      ${BUMP_CLOCK}
      ${stamp}
    END;
  `;
}

function tombstoneTrigger(table: string) {
  const target = TOMBSTONED_ENTITIES[table];
  if (!target) return "";
  const parentGuard =
    table === "sessions"
      ? ""
      : "WHEN EXISTS (SELECT 1 FROM sessions WHERE id = OLD.session_id)";
  return `
    CREATE TRIGGER IF NOT EXISTS sync_${table}_deleted AFTER DELETE ON ${table}
    ${parentGuard}
    BEGIN
      ${BUMP_CLOCK}
      INSERT INTO sync_tombstones (change_seq, entity, entity_id, session_id, deleted_at)
      VALUES (
        ${NEXT_SEQ},
        '${target.entity}',
        OLD.${target.idColumn},
        OLD.${target.sessionColumn},
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
  `;
}

export function ensureSyncTracking(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_clock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seq INTEGER NOT NULL,
      database_id TEXT NOT NULL,
      tombstone_floor INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO sync_clock (id, seq, database_id)
    VALUES (1, 0, lower(hex(randomblob(16))));
    CREATE TABLE IF NOT EXISTS sync_tombstones (
      change_seq INTEGER PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      session_id TEXT,
      deleted_at TEXT NOT NULL
    );
  `);
  for (const table of SYNC_TRACKED_TABLES) {
    if (!hasColumn(database, table, "change_seq")) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN change_seq INTEGER NOT NULL DEFAULT 0`,
      );
    }
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_${table}_change_seq ON ${table}(change_seq);
      ${stampTriggers(table)}
      ${tombstoneTrigger(table)}
    `);
  }
}

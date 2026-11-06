import type { DatabaseSync } from "node:sqlite";

export function createRoutinesSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      access TEXT NOT NULL DEFAULT 'read-and-draft',
      deliver TEXT NOT NULL DEFAULT 'inbox',
      paused_reason TEXT,
      session_id TEXT,
      next_run_at TEXT,
      last_run_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES personal_agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_routines_agent
      ON routines(agent_id);

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      session_id TEXT,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      error TEXT,
      outcome TEXT,
      question TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine_started
      ON routine_runs(routine_id, started_at);
  `;
}

export function migrateRoutineReports(database: DatabaseSync): void {
  const columns = new Set(
    database
      .prepare("PRAGMA table_info(routine_runs)")
      .all()
      .map((row) => String(row.name)),
  );
  for (const column of ["outcome", "question"]) {
    if (!columns.has(column)) {
      database.exec(`ALTER TABLE routine_runs ADD COLUMN ${column} TEXT`);
    }
  }
  database.exec(
    "UPDATE routines SET access = 'read-and-draft' WHERE access = 'ask'",
  );
}

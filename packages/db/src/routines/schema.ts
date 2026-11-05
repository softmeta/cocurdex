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
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine_started
      ON routine_runs(routine_id, started_at);
  `;
}

export function createScriptRunSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS script_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      requester_session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      script TEXT NOT NULL,
      status TEXT NOT NULL,
      max_agents INTEGER NOT NULL,
      agent_count INTEGER NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_script_runs_requester
      ON script_runs(requester_session_id, created_at);

    CREATE TABLE IF NOT EXISTS script_run_agents (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (run_id) REFERENCES script_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_script_run_agents_run
      ON script_run_agents(run_id, created_at);
  `;
}

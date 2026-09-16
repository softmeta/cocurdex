export function createTeamSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      lead_session_id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL,
      issue_view_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      agent_role_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_id, session_id),
      UNIQUE (team_id, name),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS team_tasks (
      team_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      blocked_by_json TEXT NOT NULL,
      evidence TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_id, issue_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_session
      ON team_members(session_id);
  `;
}

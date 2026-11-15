export function createFollowUpsSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      fired_at TEXT,
      canceled_at TEXT,
      FOREIGN KEY (agent_id) REFERENCES personal_agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due
      ON follow_ups(status, due_at);

    CREATE INDEX IF NOT EXISTS idx_follow_ups_agent
      ON follow_ups(agent_id, due_at);
  `;
}

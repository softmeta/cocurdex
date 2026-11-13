export function createPersonalAgentsSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS personal_agents (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL UNIQUE,
      home_session_id TEXT NOT NULL UNIQUE,
      soul TEXT,
      user_address TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      pinned_at TEXT,
      muted_at TEXT,
      sort_order REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES agent_roles(id),
      FOREIGN KEY (home_session_id) REFERENCES sessions(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_agents_default
      ON personal_agents(is_default) WHERE is_default = 1;
  `;
}

export const PERSONAL_AGENT_USER_ADDRESS_COLUMN = "user_address";

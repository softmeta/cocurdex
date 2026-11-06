export function createDelegationsSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS delegations (
      work_session_id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      requester_session_id TEXT NOT NULL,
      team_template_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_delegations_persona
      ON delegations(persona_id, created_at);
  `;
}

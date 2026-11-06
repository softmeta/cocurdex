export function createOutboxSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS push_outbox (
      id TEXT PRIMARY KEY,
      target_handle TEXT NOT NULL,
      plaintext TEXT NOT NULL,
      collapse_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_push_outbox_next_attempt
      ON push_outbox(next_attempt_at);
  `;
}

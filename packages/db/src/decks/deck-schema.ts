export function createDecksSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      slide_count INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decks_updated_at ON decks(updated_at DESC);
  `;
}

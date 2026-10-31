const ENTITY_TABLES = {
  session: "sessions",
  note: "notes",
  issue: "issues",
  deck: "decks",
} as const;

function cleanupTrigger(kind: keyof typeof ENTITY_TABLES) {
  const table = ENTITY_TABLES[kind];
  return `
    CREATE TRIGGER IF NOT EXISTS entity_links_${table}_deleted
    AFTER DELETE ON ${table}
    BEGIN
      DELETE FROM entity_links
      WHERE (source_kind = '${kind}' AND source_id = OLD.id)
         OR (target_kind = '${kind}' AND target_id = OLD.id);
    END;
  `;
}

export function createEntityLinksSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS entity_links (
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_kind, source_id, target_kind, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entity_links_target
      ON entity_links(target_kind, target_id);
    ${cleanupTrigger("session")}
    ${cleanupTrigger("note")}
    ${cleanupTrigger("issue")}
    ${cleanupTrigger("deck")}
  `;
}

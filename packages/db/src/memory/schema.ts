export function createMemoryEntriesSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      project TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT,
      importance TEXT NOT NULL DEFAULT 'trivial',
      tags_json TEXT NOT NULL DEFAULT '[]',
      parent_id TEXT,
      supersedes_json TEXT NOT NULL DEFAULT '[]',
      superseded_by TEXT,
      see_also_json TEXT NOT NULL DEFAULT '[]',
      device TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memory_entries_project_updated
      ON memory_entries(project, updated_at DESC);

    CREATE TABLE IF NOT EXISTS memory_entry_links (
      entry_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      PRIMARY KEY (entry_id, provider)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_entry_links_remote
      ON memory_entry_links(provider, remote_id);

    CREATE TABLE IF NOT EXISTS memory_entry_history (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      action TEXT NOT NULL,
      title TEXT,
      content TEXT,
      actor TEXT,
      at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_entry_history_entry
      ON memory_entry_history(entry_id, seq DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      entry_id UNINDEXED,
      title,
      content,
      tags,
      tokenize = 'trigram'
    );

    CREATE TRIGGER IF NOT EXISTS memory_entries_fts_insert
    AFTER INSERT ON memory_entries
    BEGIN
      INSERT INTO memory_fts(entry_id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags_json);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_entries_fts_update
    AFTER UPDATE ON memory_entries
    BEGIN
      DELETE FROM memory_fts WHERE entry_id = old.id;
      INSERT INTO memory_fts(entry_id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags_json);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_entries_fts_delete
    AFTER DELETE ON memory_entries
    BEGIN
      DELETE FROM memory_fts WHERE entry_id = old.id;
    END;
  `;
}

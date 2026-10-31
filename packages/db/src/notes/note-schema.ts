import type { DatabaseSync } from "node:sqlite";
import { createNoteDocState } from "@cocurdex/note-doc";

const NOTE_COLUMN_ADDITIONS = [
  ["doc_state", "BLOB"],
  ["space_id", "TEXT NOT NULL DEFAULT 'local'"],
] as const;

function columnNames(database: DatabaseSync, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return new Set(rows.map((row) => row.name));
}

function backfillNoteDocStates(database: DatabaseSync): void {
  const rows = database
    .prepare(
      `SELECT id, body_markdown FROM notes
       WHERE kind = 'note' AND doc_state IS NULL`,
    )
    .all() as { id: string; body_markdown: string }[];
  const write = database.prepare("UPDATE notes SET doc_state = ? WHERE id = ?");
  for (const row of rows) {
    write.run(createNoteDocState(row.body_markdown), row.id);
  }
}

export function migrateNotesToCollaborativeDocs(database: DatabaseSync): void {
  const existing = columnNames(database, "notes");
  for (const [column, definition] of NOTE_COLUMN_ADDITIONS) {
    if (!existing.has(column)) {
      database.exec(`ALTER TABLE notes ADD COLUMN ${column} ${definition}`);
    }
  }
  backfillNoteDocStates(database);
}

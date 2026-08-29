import type { DatabaseSync } from "node:sqlite";
import { mapEditorView } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { EditorViewRepository } from "./editor-view-repository";

export function createSqliteEditorViewRepository(
  database: DatabaseSync,
): EditorViewRepository {
  return {
    async getBySessionId(sessionId) {
      const row = database
        .prepare("SELECT * FROM editor_views WHERE session_id = ?")
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapEditorView(row) : null;
    },
    async list() {
      const rows = database
        .prepare("SELECT * FROM editor_views ORDER BY session_id ASC")
        .all() as SqliteRow[];
      return rows.map(mapEditorView);
    },
    async upsert(view) {
      const sessionExists = database
        .prepare("SELECT 1 FROM sessions WHERE id = ?")
        .get(view.sessionId);

      if (!sessionExists) {
        return;
      }

      database
        .prepare(
          `INSERT INTO editor_views (
             session_id, open_files_json, active_file, selections_json
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             open_files_json = excluded.open_files_json,
             active_file = excluded.active_file,
             selections_json = excluded.selections_json`,
        )
        .run(
          view.sessionId,
          JSON.stringify(view.openFiles),
          view.activeFile,
          JSON.stringify(view.selections),
        );
    },
  };
}

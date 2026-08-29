import type { DatabaseSync } from "node:sqlite";
import { mapToolCall, mapToolCallSummary } from "../mappers";
import { parseJson, type SqliteRow } from "../sqlite-types";
import type { ToolCallRepository } from "./tool-call-repository";

// Columns required to render the tool-call trigger row and group header. Notably
// excludes the result columns — those fields are fetched lazily when the user
// opens the detail popover/sheet (see getResultById).
const SUMMARY_COLUMNS =
  "id, session_id, title, kind, status, raw_input_json, locations_json, started_at, updated_at";

export function createSqliteToolCallRepository(
  database: DatabaseSync,
): ToolCallRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM tool_calls
           ORDER BY started_at ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapToolCall);
    },
    async listBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT * FROM tool_calls
           WHERE session_id = ?
           ORDER BY started_at ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapToolCall);
    },
    async listSummariesBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM tool_calls
           WHERE session_id = ?
           ORDER BY started_at ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapToolCallSummary);
    },
    async getResultById(toolCallId) {
      const row = database
        .prepare(
          "SELECT content_json, raw_output_json FROM tool_calls WHERE id = ? LIMIT 1",
        )
        .get(toolCallId) as SqliteRow | undefined;
      if (!row) {
        return null;
      }
      return {
        content: parseJson(row.content_json, []),
        rawOutput: parseJson(row.raw_output_json, null),
      };
    },
    async upsert(toolCall) {
      database
        .prepare(
          `INSERT INTO tool_calls (
             id, session_id, title, kind, status, content_json,
             raw_input_json, raw_output_json, locations_json, started_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             session_id = excluded.session_id,
             title = excluded.title,
             kind = excluded.kind,
             status = excluded.status,
             content_json = excluded.content_json,
             raw_input_json = excluded.raw_input_json,
             raw_output_json = excluded.raw_output_json,
             locations_json = excluded.locations_json,
             started_at = excluded.started_at,
             updated_at = excluded.updated_at`,
        )
        .run(
          toolCall.id,
          toolCall.sessionId,
          toolCall.title,
          toolCall.kind ?? null,
          toolCall.status,
          JSON.stringify(toolCall.content ?? []),
          JSON.stringify(toolCall.rawInput ?? null),
          JSON.stringify(toolCall.rawOutput ?? null),
          JSON.stringify(toolCall.locations),
          toolCall.startedAt,
          toolCall.updatedAt,
        );
    },
    async deleteAfter(sessionId, startedAt) {
      database
        .prepare(
          `DELETE FROM tool_calls
           WHERE session_id = ? AND started_at > ?`,
        )
        .run(sessionId, startedAt);
    },
    async clearBySessionId(sessionId) {
      database
        .prepare("DELETE FROM tool_calls WHERE session_id = ?")
        .run(sessionId);
    },
    async failNonTerminal() {
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE tool_calls
           SET status = 'failed', updated_at = ?
           WHERE status IN ('pending', 'in_progress')`,
        )
        .run(now);
    },
  };
}

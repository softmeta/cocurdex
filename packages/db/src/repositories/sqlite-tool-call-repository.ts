import type { DatabaseSync } from "node:sqlite";
import { mapToolCall, mapToolCallSummary } from "../mappers";
import { parseJson, type SqliteRow } from "../sqlite-types";
import { allocateTimelineSeq } from "../timeline-sequence";
import type { ToolCallRepository } from "./tool-call-repository";

// Columns required to render the tool-call trigger row and group header. Notably
// excludes the result columns — those fields are fetched lazily when the user
// opens the detail popover/sheet (see getResultById).
const SUMMARY_COLUMNS =
  "id, session_id, title, kind, status, subagent_json, raw_input_json, locations_json, started_at, updated_at, seq, run_id";

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
           ORDER BY seq ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapToolCall);
    },
    async listSummariesBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM tool_calls
           WHERE session_id = ?
           ORDER BY seq ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapToolCallSummary);
    },
    async listSummariesChangedSince(sessionId, changeSeq) {
      const rows = database
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM tool_calls
           WHERE session_id = ? AND change_seq > ?
           ORDER BY seq ASC`,
        )
        .all(sessionId, changeSeq) as SqliteRow[];
      return rows.map(mapToolCallSummary);
    },
    async getResultById(toolCallId) {
      const row = database
        .prepare(
          "SELECT content_json, raw_output_json, result_ref FROM tool_calls WHERE id = ? LIMIT 1",
        )
        .get(toolCallId) as SqliteRow | undefined;
      if (!row) {
        return null;
      }
      return {
        result: {
          content: parseJson(row.content_json, []),
          rawOutput: parseJson(row.raw_output_json, null),
        },
        resultRef: typeof row.result_ref === "string" ? row.result_ref : null,
      };
    },
    async listResultRefsBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT id, result_ref FROM tool_calls
           WHERE session_id = ? AND result_ref IS NOT NULL`,
        )
        .all(sessionId) as { id: string; result_ref: string }[];
      return new Map(rows.map((row) => [row.id, row.result_ref]));
    },
    async listResultRefs() {
      const rows = database
        .prepare(
          "SELECT DISTINCT result_ref FROM tool_calls WHERE result_ref IS NOT NULL",
        )
        .all() as { result_ref: string }[];
      return new Set(rows.map((row) => row.result_ref));
    },
    async listExternalizableResults({ minBytes, limit, afterRowId }) {
      const rows = database
        .prepare(
          `SELECT rowid AS row_id, id, updated_at, content_json, raw_output_json
           FROM tool_calls
           WHERE rowid > ?
             AND result_ref IS NULL
             AND status IN ('completed', 'failed')
             AND length(content_json) + length(coalesce(raw_output_json, '')) >= ?
           ORDER BY rowid
           LIMIT ?`,
        )
        .all(afterRowId, minBytes, limit) as SqliteRow[];
      return rows.map((row) => ({
        rowId: Number(row.row_id),
        toolCallId: String(row.id),
        updatedAt: String(row.updated_at),
        result: {
          content: parseJson(row.content_json, []),
          rawOutput: parseJson(row.raw_output_json, null),
        },
      }));
    },
    async externalizeResult(toolCallId, updatedAt, resultRef) {
      const changed = database
        .prepare(
          `UPDATE tool_calls
           SET result_ref = ?, content_json = '[]', raw_output_json = 'null'
           WHERE id = ? AND updated_at = ? AND result_ref IS NULL`,
        )
        .run(resultRef, toolCallId, updatedAt);
      return Number(changed.changes) > 0;
    },
    async upsert(toolCall) {
      const existing = database
        .prepare("SELECT seq FROM tool_calls WHERE id = ?")
        .get(toolCall.id) as { seq?: number | null } | undefined;
      const seq = existing
        ? null
        : (toolCall.seq ?? allocateTimelineSeq(database, toolCall.sessionId));
      database
        .prepare(
          `INSERT INTO tool_calls (
             id, session_id, title, kind, status, subagent_json, content_json,
             raw_input_json, raw_output_json, locations_json, started_at, updated_at,
             seq, run_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             session_id = excluded.session_id,
             title = excluded.title,
             kind = excluded.kind,
             status = excluded.status,
             subagent_json = excluded.subagent_json,
             content_json = excluded.content_json,
             raw_input_json = excluded.raw_input_json,
             raw_output_json = excluded.raw_output_json,
             locations_json = excluded.locations_json,
             started_at = excluded.started_at,
             updated_at = excluded.updated_at,
             run_id = COALESCE(tool_calls.run_id, excluded.run_id),
             result_ref = NULL`,
        )
        .run(
          toolCall.id,
          toolCall.sessionId,
          toolCall.title,
          toolCall.kind ?? null,
          toolCall.status,
          JSON.stringify(toolCall.subagent ?? null),
          JSON.stringify(toolCall.content ?? []),
          JSON.stringify(toolCall.rawInput ?? null),
          JSON.stringify(toolCall.rawOutput ?? null),
          JSON.stringify(toolCall.locations),
          toolCall.startedAt,
          toolCall.updatedAt,
          seq,
          toolCall.runId ?? null,
        );
      return existing ? (existing.seq ?? null) : seq;
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

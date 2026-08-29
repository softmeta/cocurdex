import type { DatabaseSync } from "node:sqlite";
import type {
  SessionActivityKind,
  SessionResultDisposition,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import { toBoolean, toNullableString } from "../sqlite-types";
import type {
  SessionAttentionRepository,
  StoredSessionAttention,
} from "./session-attention-repository";

function isActivityKind(
  value: unknown,
): value is Exclude<SessionActivityKind, null> {
  return value === "foreground" || value === "background";
}

function isResultDisposition(
  value: unknown,
): value is SessionResultDisposition {
  return value === "automatic" || value === "unread" || value === "settled";
}

function mapSessionAttention(row: SqliteRow): StoredSessionAttention {
  return {
    sessionId: String(row.session_id),
    activityKind: isActivityKind(row.activity_kind) ? row.activity_kind : null,
    connectionPending: toBoolean(row.connection_pending),
    latestResultAt: toNullableString(row.latest_result_at),
    lastVisitedAt: toNullableString(row.last_visited_at),
    resultDisposition: isResultDisposition(row.result_disposition)
      ? row.result_disposition
      : "automatic",
    updatedAt: String(row.updated_at),
  };
}

export function createSqliteSessionAttentionRepository(
  database: DatabaseSync,
): SessionAttentionRepository {
  return {
    async list() {
      const rows = database
        .prepare("SELECT * FROM session_attention ORDER BY session_id ASC")
        .all() as SqliteRow[];
      return rows.map(mapSessionAttention);
    },
    async getBySessionId(sessionId) {
      const row = database
        .prepare("SELECT * FROM session_attention WHERE session_id = ?")
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapSessionAttention(row) : null;
    },
    async upsert(attention) {
      database
        .prepare(
          `INSERT INTO session_attention (
             session_id, last_visited_at, latest_result_at,
             result_disposition, activity_kind, connection_pending, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             last_visited_at = excluded.last_visited_at,
             latest_result_at = excluded.latest_result_at,
             result_disposition = excluded.result_disposition,
             activity_kind = excluded.activity_kind,
             connection_pending = excluded.connection_pending,
             updated_at = excluded.updated_at`,
        )
        .run(
          attention.sessionId,
          attention.lastVisitedAt,
          attention.latestResultAt,
          attention.resultDisposition,
          attention.activityKind,
          attention.connectionPending ? 1 : 0,
          attention.updatedAt,
        );
    },
  };
}

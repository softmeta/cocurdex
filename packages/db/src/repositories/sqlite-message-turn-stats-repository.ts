import type { DatabaseSync } from "node:sqlite";
import type {
  AgentTurnCompletedEvent,
  AgentUsageRecord,
} from "@cocurdex/shared";
import { parseJson, type SqliteRow } from "../sqlite-types";
import type { MessageTurnStatsRepository } from "./message-turn-stats-repository";

function parseUsage(value: unknown): AgentUsageRecord | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return parseJson<AgentUsageRecord>(value, {
    inputTokens: 0,
    outputTokens: 0,
  });
}

function mapTurnStats(row: SqliteRow): AgentTurnCompletedEvent {
  return {
    type: "turn.completed",
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    durationMs: Number(row.duration_ms),
    usage: parseUsage(row.usage_json),
    completedAt: String(row.completed_at),
  };
}

export function createSqliteMessageTurnStatsRepository(
  database: DatabaseSync,
): MessageTurnStatsRepository {
  return {
    async listBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT *
           FROM message_turn_stats
           WHERE session_id = ?`,
        )
        .all(sessionId) as SqliteRow[];

      return Object.fromEntries(
        rows.map((row) => {
          const stats = mapTurnStats(row);
          return [stats.messageId, stats];
        }),
      );
    },
    async upsert(event) {
      database
        .prepare(
          `INSERT OR REPLACE INTO message_turn_stats (
             message_id, session_id, duration_ms, usage_json, completed_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          event.messageId,
          event.sessionId,
          event.durationMs,
          event.usage ? JSON.stringify(event.usage) : null,
          event.completedAt,
        );
    },
  };
}

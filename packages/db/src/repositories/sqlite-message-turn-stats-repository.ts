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

type TurnStopReason = NonNullable<AgentTurnCompletedEvent["stopReason"]>;

const TURN_STOP_REASONS = new Set<string>([
  "cancelled",
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "unknown",
] satisfies TurnStopReason[]);

function parseStopReason(value: unknown): TurnStopReason | undefined {
  return typeof value === "string" && TURN_STOP_REASONS.has(value)
    ? (value as TurnStopReason)
    : undefined;
}

function mapTurnStats(row: SqliteRow): AgentTurnCompletedEvent {
  const stopReason = parseStopReason(row.stop_reason);
  return {
    type: "turn.completed",
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    durationMs: Number(row.duration_ms),
    usage: parseUsage(row.usage_json),
    ...(stopReason ? { stopReason } : {}),
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
             message_id, session_id, duration_ms, usage_json, stop_reason,
             completed_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.messageId,
          event.sessionId,
          event.durationMs,
          event.usage ? JSON.stringify(event.usage) : null,
          event.stopReason ?? null,
          event.completedAt,
        );
    },
  };
}

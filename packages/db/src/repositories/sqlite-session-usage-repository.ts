import type { DatabaseSync } from "node:sqlite";
import { type AgentUsageRecord, mergeUsageRecords } from "@cocurdex/shared";
import { parseJson, type SqliteRow } from "../sqlite-types";
import type { SessionUsageRepository } from "./session-usage-repository";

function parseUsage(value: unknown): AgentUsageRecord {
  return parseJson<AgentUsageRecord>(value, {
    inputTokens: 0,
    outputTokens: 0,
  });
}

export function createSqliteSessionUsageRepository(
  database: DatabaseSync,
): SessionUsageRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT session_id, usage_json
           FROM session_usage`,
        )
        .all() as SqliteRow[];

      return Object.fromEntries(
        rows.map((row) => [String(row.session_id), parseUsage(row.usage_json)]),
      );
    },
    async add(sessionId, usage, updatedAt) {
      const row = database
        .prepare(
          `SELECT usage_json
           FROM session_usage
           WHERE session_id = ?`,
        )
        .get(sessionId) as SqliteRow | undefined;
      const nextUsage = mergeUsageRecords(
        row ? parseUsage(row.usage_json) : undefined,
        usage,
      );

      database
        .prepare(
          `INSERT OR REPLACE INTO session_usage (
             session_id, usage_json, updated_at
           ) VALUES (?, ?, ?)`,
        )
        .run(sessionId, JSON.stringify(nextUsage), updatedAt);
    },
  };
}

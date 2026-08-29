import type { DatabaseSync } from "node:sqlite";
import { mapProviderSession } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ProviderSessionRepository } from "./provider-session-repository";

export function createSqliteProviderSessionRepository(
  database: DatabaseSync,
): ProviderSessionRepository {
  return {
    async getBySessionId(sessionId) {
      const row = database
        .prepare(
          `SELECT * FROM agent_provider_sessions
           WHERE session_id = ?`,
        )
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapProviderSession(row) : null;
    },
    async upsert(record) {
      database
        .prepare(
          `INSERT INTO agent_provider_sessions (
             session_id, provider_session_id, provider_state_json,
             provider_version, resumable, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             provider_session_id = excluded.provider_session_id,
             provider_state_json = excluded.provider_state_json,
             provider_version = excluded.provider_version,
             resumable = excluded.resumable,
             updated_at = excluded.updated_at`,
        )
        .run(
          record.sessionId,
          record.providerSessionId,
          record.providerStateJson,
          record.providerVersion,
          record.resumable ? 1 : 0,
          record.updatedAt,
        );
    },
    async clear(sessionId) {
      database
        .prepare(
          `DELETE FROM agent_provider_sessions
           WHERE session_id = ?`,
        )
        .run(sessionId);
    },
  };
}

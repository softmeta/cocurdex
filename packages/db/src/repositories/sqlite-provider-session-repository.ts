import type { DatabaseSync } from "node:sqlite";
import { mapProviderSession } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ProviderSessionRepository } from "./provider-session-repository";

export function createSqliteProviderSessionRepository(
  database: DatabaseSync,
): ProviderSessionRepository {
  return {
    async get(sessionId, agentType) {
      const row = database
        .prepare(
          `SELECT * FROM agent_provider_sessions
           WHERE session_id = ? AND agent_type = ?`,
        )
        .get(sessionId, agentType) as SqliteRow | undefined;
      return row ? mapProviderSession(row) : null;
    },
    async upsert(agentType, record) {
      database
        .prepare(
          `INSERT INTO agent_provider_sessions (
             session_id, agent_type, provider_session_id, provider_state_json,
             provider_version, resumable, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, agent_type) DO UPDATE SET
             provider_session_id = excluded.provider_session_id,
             provider_state_json = excluded.provider_state_json,
             provider_version = excluded.provider_version,
             resumable = excluded.resumable,
             updated_at = excluded.updated_at`,
        )
        .run(
          record.sessionId,
          agentType,
          record.providerSessionId,
          record.providerStateJson,
          record.providerVersion,
          record.resumable ? 1 : 0,
          record.updatedAt,
        );
    },
    async clear(sessionId, agentType) {
      database
        .prepare(
          `DELETE FROM agent_provider_sessions
           WHERE session_id = ? AND agent_type = ?`,
        )
        .run(sessionId, agentType);
    },
    async clearSession(sessionId) {
      database
        .prepare(
          `DELETE FROM agent_provider_sessions
           WHERE session_id = ?`,
        )
        .run(sessionId);
    },
  };
}

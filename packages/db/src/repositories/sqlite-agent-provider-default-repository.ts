import type { DatabaseSync } from "node:sqlite";
import { mapAgentDefault } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { AgentProviderDefaultRepository } from "./agent-provider-default-repository";

export function createSqliteAgentProviderDefaultRepository(
  database: DatabaseSync,
): AgentProviderDefaultRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM agent_provider_defaults
           ORDER BY agent_id ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapAgentDefault);
    },
    async getByAgentId(agentId) {
      const row = database
        .prepare(
          `SELECT * FROM agent_provider_defaults
           WHERE agent_id = ?`,
        )
        .get(agentId) as SqliteRow | undefined;
      return row ? mapAgentDefault(row) : null;
    },
    async upsert(selection) {
      database
        .prepare(
          `INSERT INTO agent_provider_defaults (
             agent_id, provider_id, model_id, is_default, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             is_default = excluded.is_default,
             updated_at = excluded.updated_at`,
        )
        .run(
          selection.agentId,
          selection.providerId,
          selection.modelId,
          selection.isDefault ? 1 : 0,
          selection.createdAt,
          selection.updatedAt,
        );
    },
    async delete(agentId) {
      database
        .prepare("DELETE FROM agent_provider_defaults WHERE agent_id = ?")
        .run(agentId);
    },
  };
}

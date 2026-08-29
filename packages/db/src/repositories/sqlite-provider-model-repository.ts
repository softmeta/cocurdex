import type { DatabaseSync } from "node:sqlite";
import { mapProviderModel } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ProviderModelRepository } from "./provider-model-repository";

export function createSqliteProviderModelRepository(
  database: DatabaseSync,
): ProviderModelRepository {
  return {
    async list(providerId) {
      const rows = providerId
        ? (database
            .prepare(
              `SELECT * FROM provider_models
               WHERE provider_id = ?
               ORDER BY enabled DESC, name ASC, model_id ASC`,
            )
            .all(providerId) as SqliteRow[])
        : (database
            .prepare(
              `SELECT * FROM provider_models
               ORDER BY provider_id ASC, enabled DESC, name ASC, model_id ASC`,
            )
            .all() as SqliteRow[]);
      return rows.map(mapProviderModel);
    },
    async get(providerId, modelId) {
      const row = database
        .prepare(
          `SELECT * FROM provider_models
           WHERE provider_id = ? AND model_id = ?`,
        )
        .get(providerId, modelId) as SqliteRow | undefined;
      return row ? mapProviderModel(row) : null;
    },
    async upsert(model) {
      database
        .prepare(
          `INSERT INTO provider_models (
             provider_id, model_id, name, api, enabled, source,
             context_limit, output_limit, capabilities_json, reasoning,
             thinking_level_map_json, cost_json, compat_json, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, model_id) DO UPDATE SET
             name = excluded.name,
             api = excluded.api,
             enabled = excluded.enabled,
             source = excluded.source,
             context_limit = excluded.context_limit,
             output_limit = excluded.output_limit,
             capabilities_json = excluded.capabilities_json,
             reasoning = excluded.reasoning,
             thinking_level_map_json = excluded.thinking_level_map_json,
             cost_json = excluded.cost_json,
             compat_json = excluded.compat_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          model.providerId,
          model.modelId,
          model.name,
          model.api,
          model.enabled ? 1 : 0,
          model.source,
          model.contextLimit ?? null,
          model.outputLimit ?? null,
          JSON.stringify(model.capabilities ?? []),
          model.reasoning ? 1 : 0,
          model.thinkingLevelMapJson ?? null,
          model.costJson ?? null,
          model.compatJson ?? null,
          model.createdAt,
          model.updatedAt,
        );
    },
    async delete(providerId, modelId) {
      database
        .prepare(
          `DELETE FROM provider_models
           WHERE provider_id = ? AND model_id = ?`,
        )
        .run(providerId, modelId);
    },
    async deleteByProvider(providerId) {
      database
        .prepare(`DELETE FROM provider_models WHERE provider_id = ?`)
        .run(providerId);
    },
  };
}

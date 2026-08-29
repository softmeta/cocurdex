import type { DatabaseSync } from "node:sqlite";
import { mapProviderConfig } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ProviderConfigRepository } from "./provider-config-repository";

export function createSqliteProviderConfigRepository(
  database: DatabaseSync,
): ProviderConfigRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM provider_configs
           ORDER BY enabled DESC, name ASC, id ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapProviderConfig);
    },
    async getById(id) {
      const row = database
        .prepare("SELECT * FROM provider_configs WHERE id = ?")
        .get(id) as SqliteRow | undefined;
      return row ? mapProviderConfig(row) : null;
    },
    async upsert(config) {
      database
        .prepare(
          `INSERT INTO provider_configs (
             id, name, base_url, enabled, api_key_secret_id, headers_json,
             compat_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             base_url = excluded.base_url,
             enabled = excluded.enabled,
             api_key_secret_id = excluded.api_key_secret_id,
             headers_json = excluded.headers_json,
             compat_json = excluded.compat_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          config.id,
          config.name,
          config.baseUrl,
          config.enabled ? 1 : 0,
          config.apiKeySecretId,
          config.headersJson ?? null,
          config.compatJson ?? null,
          config.createdAt,
          config.updatedAt,
        );
    },
    async delete(id) {
      database.prepare("DELETE FROM provider_configs WHERE id = ?").run(id);
    },
    async setApiKeySecretId(id, secretId) {
      database
        .prepare(
          `UPDATE provider_configs
           SET api_key_secret_id = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(secretId, new Date().toISOString(), id);
    },
  };
}

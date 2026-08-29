import type { DatabaseSync } from "node:sqlite";
import type { AppSettingsRepository } from "./app-settings-repository";

export function createSqliteAppSettingsRepository(
  database: DatabaseSync,
): AppSettingsRepository {
  return {
    async get(key) {
      const row = database
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(key) as { value_json?: unknown } | undefined;
      return typeof row?.value_json === "string" ? row.value_json : null;
    },
    async set(key, valueJson) {
      database
        .prepare(
          `INSERT INTO app_settings (key, value_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
        )
        .run(key, valueJson, new Date().toISOString());
    },
  };
}

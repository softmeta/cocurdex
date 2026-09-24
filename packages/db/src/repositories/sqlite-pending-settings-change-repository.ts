import type { DatabaseSync } from "node:sqlite";
import type { PendingSettingsChangeRecord } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { PendingSettingsChangeRepository } from "./pending-settings-change-repository";

function mapPendingSettingsChange(row: SqliteRow): PendingSettingsChangeRecord {
  let value: unknown = null;
  try {
    value = JSON.parse(String(row.value_json ?? "null"));
  } catch {
    value = null;
  }
  return {
    id: String(row.id),
    key: String(row.key),
    value,
    createdAt: String(row.created_at),
  };
}

export function createSqlitePendingSettingsChangeRepository(
  database: DatabaseSync,
): PendingSettingsChangeRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT id, key, value_json, created_at
           FROM pending_settings_changes ORDER BY created_at`,
        )
        .all() as SqliteRow[];
      return rows.map(mapPendingSettingsChange);
    },
    async add(change: PendingSettingsChangeRecord) {
      database
        .prepare(
          `INSERT INTO pending_settings_changes (id, key, value_json, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          change.id,
          change.key,
          JSON.stringify(change.value ?? null),
          change.createdAt,
        );
    },
    async delete(id: string) {
      database
        .prepare("DELETE FROM pending_settings_changes WHERE id = ?")
        .run(id);
    },
  };
}

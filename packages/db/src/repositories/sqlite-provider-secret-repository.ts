import type { DatabaseSync } from "node:sqlite";
import { mapProviderSecret } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ProviderSecretRepository } from "./provider-secret-repository";

export function createSqliteProviderSecretRepository(
  database: DatabaseSync,
): ProviderSecretRepository {
  return {
    async getById(id) {
      const row = database
        .prepare("SELECT * FROM provider_secrets WHERE id = ?")
        .get(id) as SqliteRow | undefined;
      return row ? mapProviderSecret(row) : null;
    },
    async upsert(secret) {
      database
        .prepare(
          `INSERT INTO provider_secrets (
             id, encrypted_value, created_at, updated_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             encrypted_value = excluded.encrypted_value,
             updated_at = excluded.updated_at`,
        )
        .run(
          secret.id,
          secret.encryptedValue,
          secret.createdAt,
          secret.updatedAt,
        );
    },
    async delete(id) {
      database.prepare("DELETE FROM provider_secrets WHERE id = ?").run(id);
    },
  };
}

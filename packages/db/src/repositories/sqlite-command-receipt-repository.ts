import type { DatabaseSync } from "node:sqlite";
import type { CommandReceiptRepository } from "./command-receipt-repository";

export function createSqliteCommandReceiptRepository(
  database: DatabaseSync,
): CommandReceiptRepository {
  return {
    async get(key) {
      const row = database
        .prepare("SELECT outcome_json FROM command_receipts WHERE key = ?")
        .get(key) as { outcome_json?: unknown } | undefined;
      return typeof row?.outcome_json === "string" ? row.outcome_json : null;
    },
    async save(key, outcomeJson, createdAt) {
      database
        .prepare(
          `INSERT INTO command_receipts (key, outcome_json, created_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO NOTHING`,
        )
        .run(key, outcomeJson, createdAt);
    },
    async deleteCreatedBefore(createdAt) {
      const result = database
        .prepare("DELETE FROM command_receipts WHERE created_at < ?")
        .run(createdAt);
      return Number(result.changes);
    },
  };
}

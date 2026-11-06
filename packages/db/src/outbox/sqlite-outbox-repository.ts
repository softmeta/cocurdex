import type { DatabaseSync } from "node:sqlite";
import type { SqliteRow } from "../sqlite-types";
import type { PushOutboxRepository, PushOutboxRow } from "./outbox-repository";

function toRow(row: SqliteRow): PushOutboxRow {
  return {
    id: String(row.id),
    targetHandle: String(row.target_handle),
    plaintext: String(row.plaintext),
    collapseId: String(row.collapse_id),
    expiresAt: Number(row.expires_at),
    attempts: Number(row.attempts),
    nextAttemptAt: String(row.next_attempt_at),
    createdAt: String(row.created_at),
  };
}

export function createSqlitePushOutboxRepository(
  database: DatabaseSync,
): PushOutboxRepository {
  const insert = database.prepare(`
    INSERT INTO push_outbox
      (id, target_handle, plaintext, collapse_id, expires_at, attempts, next_attempt_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listDue = database.prepare(`
    SELECT * FROM push_outbox
    WHERE next_attempt_at <= ?
    ORDER BY next_attempt_at, created_at
    LIMIT ?
  `);
  const reschedule = database.prepare(
    "UPDATE push_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?",
  );
  const remove = database.prepare("DELETE FROM push_outbox WHERE id = ?");
  const removeExpired = database.prepare(
    "DELETE FROM push_outbox WHERE expires_at <= ?",
  );

  return {
    insert(row) {
      insert.run(
        row.id,
        row.targetHandle,
        row.plaintext,
        row.collapseId,
        row.expiresAt,
        row.attempts,
        row.nextAttemptAt,
        row.createdAt,
      );
    },
    listDue(at, limit) {
      return listDue.all(at, limit).map((row) => toRow(row as SqliteRow));
    },
    reschedule(id, attempts, nextAttemptAt) {
      reschedule.run(attempts, nextAttemptAt, id);
    },
    delete(id) {
      remove.run(id);
    },
    deleteExpired(nowSeconds) {
      return Number(removeExpired.run(nowSeconds).changes);
    },
  };
}

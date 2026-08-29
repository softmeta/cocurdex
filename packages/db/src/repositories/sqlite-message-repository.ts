import type { DatabaseSync } from "node:sqlite";
import { mapMessage } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { MessageRepository } from "./message-repository";

export function createSqliteMessageRepository(
  database: DatabaseSync,
): MessageRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM messages
           ORDER BY created_at ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapMessage);
    },
    async listBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT * FROM messages
           WHERE session_id = ?
           ORDER BY created_at ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapMessage);
    },
    async getById(messageId) {
      const row = database
        .prepare(
          `SELECT * FROM messages
           WHERE id = ?`,
        )
        .get(messageId) as SqliteRow | undefined;
      return row ? mapMessage(row) : null;
    },
    async append(message) {
      database
        .prepare(
          `INSERT OR REPLACE INTO messages (
             id, session_id, role, kind, content, attachments_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.id,
          message.sessionId,
          message.role,
          message.kind ?? null,
          message.content,
          JSON.stringify(message.attachments),
          message.createdAt,
        );
    },
    async update(message) {
      database
        .prepare(
          `UPDATE messages
           SET role = ?, kind = ?, content = ?, attachments_json = ?, created_at = ?
           WHERE id = ?`,
        )
        .run(
          message.role,
          message.kind ?? null,
          message.content,
          JSON.stringify(message.attachments),
          message.createdAt,
          message.id,
        );
    },
    async delete(messageId) {
      database.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
    },
    async deleteAfter(sessionId, createdAt) {
      database
        .prepare(
          `DELETE FROM messages
           WHERE session_id = ? AND created_at > ?`,
        )
        .run(sessionId, createdAt);
    },
  };
}

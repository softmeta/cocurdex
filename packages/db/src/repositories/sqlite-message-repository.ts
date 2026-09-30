import type { DatabaseSync } from "node:sqlite";
import { mapMessage } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import { allocateTimelineSeq } from "../timeline-sequence";
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
           ORDER BY seq ASC`,
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
      const existing = database
        .prepare("SELECT seq FROM messages WHERE id = ?")
        .get(message.id) as { seq?: number | null } | undefined;
      const seq = existing
        ? null
        : (message.seq ?? allocateTimelineSeq(database, message.sessionId));
      database
        .prepare(
          `INSERT INTO messages (
             id, session_id, role, kind, content, attachments_json, created_at,
             origin_json, seq
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             session_id = excluded.session_id,
             role = excluded.role,
             kind = excluded.kind,
             content = excluded.content,
             attachments_json = excluded.attachments_json,
             created_at = excluded.created_at,
             origin_json = excluded.origin_json`,
        )
        .run(
          message.id,
          message.sessionId,
          message.role,
          message.kind ?? null,
          message.content,
          JSON.stringify(message.attachments),
          message.createdAt,
          message.origin ? JSON.stringify(message.origin) : null,
          seq,
        );
      return existing ? (existing.seq ?? null) : seq;
    },
    async moveToEnd(messageId, sessionId) {
      const seq = allocateTimelineSeq(database, sessionId);
      database
        .prepare("UPDATE messages SET seq = ? WHERE id = ? AND session_id = ?")
        .run(seq, messageId, sessionId);
      return seq;
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
    async deleteAfter(sessionId, messageId) {
      database
        .prepare(
          `DELETE FROM messages
           WHERE session_id = ?
             AND seq > (SELECT seq FROM messages WHERE id = ?)`,
        )
        .run(sessionId, messageId);
    },
  };
}

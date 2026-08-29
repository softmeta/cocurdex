import type { DatabaseSync } from "node:sqlite";
import { mapConversationMessage } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ConversationMessageRepository } from "./conversation-message-repository";

export function createSqliteConversationMessageRepository(
  database: DatabaseSync,
): ConversationMessageRepository {
  return {
    async listByConversationId(conversationId) {
      const rows = database
        .prepare(
          `SELECT * FROM conversation_messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC`,
        )
        .all(conversationId) as SqliteRow[];
      return rows.map(mapConversationMessage);
    },
    async getById(messageId) {
      const row = database
        .prepare("SELECT * FROM conversation_messages WHERE id = ?")
        .get(messageId) as SqliteRow | undefined;
      return row ? mapConversationMessage(row) : null;
    },
    async upsert(message) {
      database
        .prepare(
          `INSERT INTO conversation_messages (
             id, conversation_id, role, content_json, status, usage_json,
             sources_json, error, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             role = excluded.role,
             content_json = excluded.content_json,
             status = excluded.status,
             usage_json = excluded.usage_json,
             sources_json = excluded.sources_json,
             error = excluded.error,
             updated_at = excluded.updated_at`,
        )
        .run(
          message.id,
          message.conversationId,
          message.role,
          JSON.stringify(message.content),
          message.status,
          message.usage ? JSON.stringify(message.usage) : null,
          JSON.stringify(message.sources),
          message.error,
          message.createdAt,
          message.updatedAt,
        );
    },
    async patch(messageId, patch) {
      const current = await this.getById(messageId);
      if (!current) {
        return null;
      }
      const next = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      await this.upsert(next);
      return next;
    },
    async deleteById(messageId) {
      database
        .prepare("DELETE FROM conversation_messages WHERE id = ?")
        .run(messageId);
    },
    async deleteByConversationId(conversationId) {
      database
        .prepare("DELETE FROM conversation_messages WHERE conversation_id = ?")
        .run(conversationId);
    },
    async failStreaming() {
      // error stays NULL so the renderer shows its localized "request failed"
      // fallback instead of an English string baked into the database.
      database
        .prepare(
          `UPDATE conversation_messages
           SET status = 'errored', updated_at = ?
           WHERE status = 'streaming'`,
        )
        .run(new Date().toISOString());
    },
  };
}

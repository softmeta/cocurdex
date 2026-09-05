import type { DatabaseSync } from "node:sqlite";
import { mapConversationMessage } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ConversationMessageRepository } from "./conversation-message-repository";
import { upsertConversationMessage } from "./upsert-conversation-message";

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
      upsertConversationMessage(database, message);
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

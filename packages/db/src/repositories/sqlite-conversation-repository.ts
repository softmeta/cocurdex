import type { DatabaseSync } from "node:sqlite";
import { mapConversation } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ConversationRepository } from "./conversation-repository";

export function createSqliteConversationRepository(
  database: DatabaseSync,
): ConversationRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM conversations
           WHERE archived_at IS NULL
           ORDER BY COALESCE(last_message_at, updated_at) DESC, created_at DESC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapConversation);
    },
    async getById(conversationId) {
      const row = database
        .prepare("SELECT * FROM conversations WHERE id = ?")
        .get(conversationId) as SqliteRow | undefined;
      return row ? mapConversation(row) : null;
    },
    async upsert(conversation) {
      database
        .prepare(
          `INSERT INTO conversations (
             id, title, provider_id, model_id, system_prompt, preset_id,
             web_search_enabled, created_at, updated_at, last_message_at,
             archived_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             system_prompt = excluded.system_prompt,
             preset_id = excluded.preset_id,
             web_search_enabled = excluded.web_search_enabled,
             updated_at = excluded.updated_at,
             last_message_at = excluded.last_message_at,
             archived_at = excluded.archived_at`,
        )
        .run(
          conversation.id,
          conversation.title,
          conversation.providerId,
          conversation.modelId,
          conversation.systemPrompt,
          conversation.presetId,
          conversation.webSearchEnabled ? 1 : 0,
          conversation.createdAt,
          conversation.updatedAt,
          conversation.lastMessageAt,
          conversation.archivedAt,
        );
    },
    async updateTitle(conversationId, title, updatedAt) {
      const nextUpdatedAt = updatedAt ?? new Date().toISOString();
      database
        .prepare(
          `UPDATE conversations
           SET title = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(title, nextUpdatedAt, conversationId);
      return this.getById(conversationId);
    },
    async updateLastMessageAt(conversationId, lastMessageAt) {
      const updatedAt = lastMessageAt ?? new Date().toISOString();
      database
        .prepare(
          `UPDATE conversations
           SET last_message_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(lastMessageAt, updatedAt, conversationId);
    },
    async archive(conversationId, archivedAt) {
      const nextArchivedAt = archivedAt ?? new Date().toISOString();
      database
        .prepare(
          `UPDATE conversations
           SET archived_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(nextArchivedAt, nextArchivedAt, conversationId);
      return this.getById(conversationId);
    },
    async delete(conversationId) {
      // FK is ON DELETE CASCADE for conversation_messages; this still works
      // even when foreign_keys pragma is disabled because we drop both rows
      // explicitly.
      database
        .prepare("DELETE FROM conversation_messages WHERE conversation_id = ?")
        .run(conversationId);
      database
        .prepare("DELETE FROM conversations WHERE id = ?")
        .run(conversationId);
    },
  };
}

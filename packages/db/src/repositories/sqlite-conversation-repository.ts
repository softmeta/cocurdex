import type { DatabaseSync } from "node:sqlite";
import { mapConversation } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { ConversationRepository } from "./conversation-repository";
import { upsertConversation } from "./upsert-conversation";
import { upsertConversationMessage } from "./upsert-conversation-message";

export function createSqliteConversationRepository(
  database: DatabaseSync,
): ConversationRepository {
  return {
    async commitTurn(conversation, messages, deletedIds) {
      database.exec("SAVEPOINT chat_turn");
      try {
        for (const id of deletedIds)
          database
            .prepare(
              "DELETE FROM conversation_messages WHERE id = ? AND conversation_id = ?",
            )
            .run(id, conversation.id);
        upsertConversation(database, conversation);
        for (const message of messages) {
          if (message.conversationId !== conversation.id)
            throw new Error("Message belongs to another conversation");
          upsertConversationMessage(database, message);
        }
        database.exec("RELEASE chat_turn");
      } catch (error) {
        database.exec("ROLLBACK TO chat_turn");
        database.exec("RELEASE chat_turn");
        throw error;
      }
    },
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
      upsertConversation(database, conversation);
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

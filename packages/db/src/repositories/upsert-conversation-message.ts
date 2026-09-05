import type { DatabaseSync } from "node:sqlite";
import type { ConversationMessageRecord } from "@cocurdex/shared";

export function upsertConversationMessage(
  database: DatabaseSync,
  message: ConversationMessageRecord,
): void {
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
}

import type { DatabaseSync } from "node:sqlite";
import type { ConversationRecord } from "@cocurdex/shared";

export function upsertConversation(
  database: DatabaseSync,
  conversation: ConversationRecord,
): void {
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
}

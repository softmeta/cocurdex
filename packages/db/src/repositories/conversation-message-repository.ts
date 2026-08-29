import type { ConversationMessageRecord } from "@cocurdex/shared";

export interface ConversationMessageRepository {
  listByConversationId(
    conversationId: string,
  ): Promise<ConversationMessageRecord[]>;
  getById(messageId: string): Promise<ConversationMessageRecord | null>;
  upsert(message: ConversationMessageRecord): Promise<void>;
  // Patch in-flight assistant messages without rewriting the whole row.
  // Use during streaming so we don't lose unrelated columns on partial saves.
  patch(
    messageId: string,
    patch: Partial<
      Pick<
        ConversationMessageRecord,
        "content" | "status" | "usage" | "sources" | "error" | "updatedAt"
      >
    >,
  ): Promise<ConversationMessageRecord | null>;
  deleteById(messageId: string): Promise<void>;
  deleteByConversationId(conversationId: string): Promise<void>;
  // Streaming lives only in the process that owns the stream, so a message
  // still marked `streaming` at startup is debris from a crash or a quit
  // mid-turn. Left alone it renders as a spinner that never resolves and
  // blocks copy/retry. Marking it errored makes the turn retryable again.
  failStreaming(): Promise<void>;
}

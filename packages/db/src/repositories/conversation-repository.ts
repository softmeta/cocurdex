import type {
  ConversationMessageRecord,
  ConversationRecord,
} from "@cocurdex/shared";

export interface ConversationRepository {
  list(): Promise<ConversationRecord[]>;
  getById(conversationId: string): Promise<ConversationRecord | null>;
  upsert(conversation: ConversationRecord): Promise<void>;
  commitTurn(
    conversation: ConversationRecord,
    messages: ConversationMessageRecord[],
    deletedIds: string[],
  ): Promise<void>;
  updateTitle(
    conversationId: string,
    title: string,
    updatedAt?: string,
  ): Promise<ConversationRecord | null>;
  updateLastMessageAt(
    conversationId: string,
    lastMessageAt: string | null,
  ): Promise<void>;
  archive(
    conversationId: string,
    archivedAt?: string,
  ): Promise<ConversationRecord | null>;
  delete(conversationId: string): Promise<void>;
}

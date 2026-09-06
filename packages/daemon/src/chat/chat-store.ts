import type { createCocurdexDatabase } from "@cocurdex/db";
import type {
  ConversationMessageRecord,
  ConversationRecord,
} from "@cocurdex/shared";

type Database = ReturnType<typeof createCocurdexDatabase>;
export type ChatDatabase = Pick<
  Database,
  "conversations" | "conversationMessages"
>;

export class ChatStore {
  constructor(private readonly getDatabase: () => Promise<ChatDatabase>) {}

  async list() {
    return (await this.getDatabase()).conversations.list();
  }

  async get(id: string) {
    return (await this.getDatabase()).conversations.getById(id);
  }

  async require(id: string) {
    const conversation = await this.get(id);
    if (!conversation) throw new Error("Conversation not found");
    return conversation;
  }

  async messages(id: string) {
    return (await this.getDatabase()).conversationMessages.listByConversationId(
      id,
    );
  }

  async save(conversation: ConversationRecord) {
    await (await this.getDatabase()).conversations.upsert(conversation);
    return conversation;
  }

  async saveMessage(message: ConversationMessageRecord) {
    await (await this.getDatabase()).conversationMessages.upsert(message);
  }

  async commit(
    conversation: ConversationRecord,
    messages: ConversationMessageRecord[],
    deleted: ConversationMessageRecord[] = [],
  ) {
    const db = await this.getDatabase();
    await db.conversations.commitTurn(
      conversation,
      messages,
      deleted.map((message) => message.id),
    );
  }

  async delete(id: string) {
    await (await this.getDatabase()).conversations.delete(id);
  }
}

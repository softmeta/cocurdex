import type { MessageRecord } from "@cocurdex/shared";

export interface MessageRepository {
  list(): Promise<MessageRecord[]>;
  listBySessionId(sessionId: string): Promise<MessageRecord[]>;
  getById(messageId: string): Promise<MessageRecord | null>;
  append(message: MessageRecord): Promise<void>;
  update(message: MessageRecord): Promise<void>;
  delete(messageId: string): Promise<void>;
  deleteAfter(sessionId: string, createdAt: string): Promise<void>;
}

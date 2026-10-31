import type { MessageRecord } from "@cocurdex/shared";

export interface MessageRepository {
  list(): Promise<MessageRecord[]>;
  listBySessionId(sessionId: string): Promise<MessageRecord[]>;
  listChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<MessageRecord[]>;
  getById(messageId: string): Promise<MessageRecord | null>;
  append(message: MessageRecord): Promise<number | null>;
  moveToEnd(messageId: string, sessionId: string): Promise<number | null>;
  assignRun(messageId: string, runId: string): Promise<void>;
  update(message: MessageRecord): Promise<void>;
  delete(messageId: string): Promise<void>;
}

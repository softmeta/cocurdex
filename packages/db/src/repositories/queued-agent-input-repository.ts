import type { MessageRecord, QueuedAgentInputRecord } from "@cocurdex/shared";

export interface QueuedAgentInputRepository {
  list(): Promise<QueuedAgentInputRecord[]>;
  listBySessionId(sessionId: string): Promise<QueuedAgentInputRecord[]>;
  listMessagesBySessionId(sessionId: string): Promise<
    {
      message: MessageRecord;
      workspaceRootPath: string;
      thinkingLevel: QueuedAgentInputRecord["thinkingLevel"];
    }[]
  >;
  enqueue(input: QueuedAgentInputRecord): Promise<void>;
  delete(messageId: string): Promise<void>;
}

import type { QueuedAgentInputRecord } from "@cocurdex/shared";

export interface QueuedAgentInputRepository {
  list(): Promise<QueuedAgentInputRecord[]>;
  listBySessionId(sessionId: string): Promise<QueuedAgentInputRecord[]>;
  enqueue(input: QueuedAgentInputRecord): Promise<void>;
  delete(messageId: string): Promise<void>;
}

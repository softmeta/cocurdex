import type { AgentMessageDeltaEvent, MessageRecord } from "@cocurdex/shared";
import { mergeMessageDelta } from "./message-delta-persistence";

export interface MessageDeltaBuffer {
  append(event: AgentMessageDeltaEvent): void;
  drain(sessionId: string): MessageRecord[];
  list(sessionId: string): MessageRecord[];
  release(messageId: string): void;
}

export function createMessageDeltaBuffer(): MessageDeltaBuffer {
  const records = new Map<string, MessageRecord>();

  return {
    append(event) {
      records.set(
        event.messageId,
        mergeMessageDelta(records.get(event.messageId) ?? null, event),
      );
    },
    drain(sessionId) {
      const drained: MessageRecord[] = [];
      for (const [messageId, record] of records) {
        if (record.sessionId === sessionId) {
          drained.push(record);
          records.delete(messageId);
        }
      }
      return drained;
    },
    list(sessionId) {
      return Array.from(records.values(), (record) => ({ ...record })).filter(
        (record) => record.sessionId === sessionId,
      );
    },
    release(messageId) {
      records.delete(messageId);
    },
  };
}

import type { AgentMessageDeltaEvent, MessageRecord } from "@cocurdex/shared";
import { mergeMessageDelta } from "./message-delta-persistence";

export interface MessageDeltaBuffer {
  has(messageId: string): boolean;
  append(event: AgentMessageDeltaEvent, seq?: number | null): MessageRecord;
  drain(sessionId: string): MessageRecord[];
  list(sessionId: string): MessageRecord[];
  release(messageId: string): MessageRecord | null;
}

export function createMessageDeltaBuffer(): MessageDeltaBuffer {
  const records = new Map<string, MessageRecord>();

  return {
    has(messageId) {
      return records.has(messageId);
    },
    append(event, seq) {
      const merged = mergeMessageDelta(
        records.get(event.messageId) ?? null,
        event,
      );
      const record = typeof seq === "number" ? { ...merged, seq } : merged;
      records.set(event.messageId, record);
      return record;
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
      const record = records.get(messageId) ?? null;
      records.delete(messageId);
      return record;
    },
  };
}

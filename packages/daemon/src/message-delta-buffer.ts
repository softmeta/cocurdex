import type { AgentMessageDeltaEvent, MessageRecord } from "@cocurdex/shared";
import { mergeMessageDelta } from "./message-delta-persistence";

export const MESSAGE_CHECKPOINT_INTERVAL_MS = 1000;
export const MESSAGE_CHECKPOINT_MAX_PENDING_CHARS = 16 * 1024;

export interface MessageDeltaBuffer {
  has(messageId: string): boolean;
  append(event: AgentMessageDeltaEvent, seq?: number | null): MessageRecord;
  takeCheckpoint(messageId: string): MessageRecord | null;
  drain(sessionId: string): MessageRecord[];
  drainAll(): MessageRecord[];
  list(sessionId: string): MessageRecord[];
  release(messageId: string): MessageRecord | null;
}

interface BufferedMessage {
  record: MessageRecord;
  pendingChars: number;
  lastCheckpointAt: number;
}

export function createMessageDeltaBuffer(
  now: () => number = Date.now,
): MessageDeltaBuffer {
  const buffered = new Map<string, BufferedMessage>();

  return {
    has(messageId) {
      return buffered.has(messageId);
    },
    append(event, seq) {
      const existing = buffered.get(event.messageId);
      const merged = mergeMessageDelta(existing?.record ?? null, event);
      const record = typeof seq === "number" ? { ...merged, seq } : merged;
      buffered.set(event.messageId, {
        record,
        pendingChars: (existing?.pendingChars ?? 0) + event.delta.length,
        lastCheckpointAt: existing?.lastCheckpointAt ?? now(),
      });
      return record;
    },
    takeCheckpoint(messageId) {
      const entry = buffered.get(messageId);
      if (!entry || entry.pendingChars === 0) {
        return null;
      }
      const at = now();
      const due =
        entry.pendingChars >= MESSAGE_CHECKPOINT_MAX_PENDING_CHARS ||
        at - entry.lastCheckpointAt >= MESSAGE_CHECKPOINT_INTERVAL_MS;
      if (!due) {
        return null;
      }
      buffered.set(messageId, {
        ...entry,
        pendingChars: 0,
        lastCheckpointAt: at,
      });
      return { ...entry.record };
    },
    drain(sessionId) {
      const drained: MessageRecord[] = [];
      for (const [messageId, entry] of buffered) {
        if (entry.record.sessionId === sessionId) {
          drained.push(entry.record);
          buffered.delete(messageId);
        }
      }
      return drained;
    },
    drainAll() {
      const drained = Array.from(buffered.values(), (entry) => entry.record);
      buffered.clear();
      return drained;
    },
    list(sessionId) {
      return Array.from(buffered.values(), (entry) => ({
        ...entry.record,
      })).filter((record) => record.sessionId === sessionId);
    },
    release(messageId) {
      const record = buffered.get(messageId)?.record ?? null;
      buffered.delete(messageId);
      return record;
    },
  };
}

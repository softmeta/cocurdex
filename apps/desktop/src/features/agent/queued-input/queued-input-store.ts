import type {
  AgentEvent,
  MessageRecord,
  QueuedAgentInputRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";

export interface QueuedAgentInputItem extends QueuedAgentInputRecord {
  message: MessageRecord;
}

type QueuedInputsBySession = Record<string, QueuedAgentInputItem[]>;

export const queuedInputsBySessionAtom = atom<QueuedInputsBySession>({});
const completedQueuedMessageIdsAtom = atom<Set<string>>(new Set<string>());

export const bootstrapQueuedInputsAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      inputs: QueuedAgentInputRecord[];
      messages: MessageRecord[];
    },
  ) => {
    const messageById = new Map(
      payload.messages.map((message) => [message.id, message]),
    );
    const completedMessageIds = get(completedQueuedMessageIdsAtom);
    const next: QueuedInputsBySession = {};

    for (const input of payload.inputs) {
      if (completedMessageIds.has(input.messageId)) continue;
      const message = messageById.get(input.messageId);
      if (!message) continue;
      const sessionInputs = next[input.sessionId] ?? [];
      next[input.sessionId] = [...sessionInputs, { ...input, message }];
    }

    set(queuedInputsBySessionAtom, next);
  },
);

export const appendQueuedInputAtom = atom(
  null,
  (get, set, item: QueuedAgentInputItem) => {
    if (get(completedQueuedMessageIdsAtom).has(item.messageId)) return;
    const current = get(queuedInputsBySessionAtom);
    const sessionInputs = current[item.sessionId] ?? [];
    const existingIndex = sessionInputs.findIndex(
      (input) => input.messageId === item.messageId,
    );
    const nextSessionInputs =
      existingIndex === -1
        ? [...sessionInputs, item]
        : sessionInputs.map((input, index) =>
            index === existingIndex ? item : input,
          );

    set(queuedInputsBySessionAtom, {
      ...current,
      [item.sessionId]: nextSessionInputs,
    });
  },
);

export const updateQueuedInputAtom = atom(
  null,
  (get, set, message: MessageRecord) => {
    const current = get(queuedInputsBySessionAtom);
    const sessionInputs = current[message.sessionId] ?? [];
    set(queuedInputsBySessionAtom, {
      ...current,
      [message.sessionId]: sessionInputs.map((input) =>
        input.messageId === message.id ? { ...input, message } : input,
      ),
    });
  },
);

export const removeQueuedInputAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      messageId: string;
    },
  ) => {
    const current = get(queuedInputsBySessionAtom);
    const sessionInputs = current[payload.sessionId] ?? [];
    const nextSessionInputs = sessionInputs.filter(
      (input) => input.messageId !== payload.messageId,
    );

    if (nextSessionInputs.length === sessionInputs.length) return;
    if (nextSessionInputs.length === 0) {
      const { [payload.sessionId]: _removed, ...remaining } = current;
      set(queuedInputsBySessionAtom, remaining);
      return;
    }

    set(queuedInputsBySessionAtom, {
      ...current,
      [payload.sessionId]: nextSessionInputs,
    });
  },
);

export const applyQueuedInputEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (event.type !== "message.completed" || event.message.role !== "user") {
      return;
    }
    set(
      completedQueuedMessageIdsAtom,
      new Set(get(completedQueuedMessageIdsAtom)).add(event.message.id),
    );
    set(removeQueuedInputAtom, {
      sessionId: event.sessionId,
      messageId: event.message.id,
    });
  },
);

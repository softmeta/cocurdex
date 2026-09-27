import type {
  AgentEvent,
  AgentTurnCompletedEvent,
  MessageRecord,
} from "@cocurdex/shared";
import type { Getter, Setter } from "jotai";
import { atom } from "jotai";
import { findMessageById, upsertMessages } from "./message-collection";

type MessagesBySession = Record<string, MessageRecord[]>;
type LoadedBySession = Record<string, boolean>;
type TurnStatsByMessage = Record<string, AgentTurnCompletedEvent>;
type MessageDeltaEvent = Extract<AgentEvent, { type: "message.delta" }>;
type PendingDelta = Omit<MessageDeltaEvent, "delta" | "type"> & {
  delta: string;
};

export const messagesBySessionAtom = atom<MessagesBySession>({});
export const messagesLoadedBySessionAtom = atom<LoadedBySession>({});
export const turnStatsByMessageAtom = atom<TurnStatsByMessage>({});

const DELTA_FLUSH_DELAY_MS = 16;
const EMPTY_MESSAGES: MessageRecord[] = [];
const deltaBufferAtom = atom(() => ({
  pendingDeltas: new Map<string, PendingDelta>(),
  timer: null as ReturnType<typeof setTimeout> | null,
}));

export function createSessionMessagesAtom(sessionId: string | null) {
  return atom((get) => {
    if (!sessionId) {
      return EMPTY_MESSAGES;
    }
    return get(messagesBySessionAtom)[sessionId] ?? EMPTY_MESSAGES;
  });
}

function getDeltaKey(event: MessageDeltaEvent) {
  return `${event.sessionId}:${event.messageId}`;
}

export const appendMessageAtom = atom(
  null,
  (get, set, message: MessageRecord) => {
    const current = get(messagesBySessionAtom);
    const sessionMessages = current[message.sessionId] ?? [];

    set(messagesBySessionAtom, {
      ...current,
      [message.sessionId]: upsertMessages(sessionMessages, [message]),
    });
  },
);

export const rewindMessagesAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      message: MessageRecord;
    },
  ) => {
    const current = get(messagesBySessionAtom);
    const sessionMessages = current[payload.message.sessionId] ?? [];

    set(messagesBySessionAtom, {
      ...current,
      [payload.message.sessionId]: sessionMessages
        .filter((message) => isAtOrBefore(message, payload.message))
        .map((message) =>
          message.id === payload.message.id ? payload.message : message,
        ),
    });
  },
);

function isAtOrBefore(message: MessageRecord, target: MessageRecord) {
  if (message.seq !== undefined && target.seq !== undefined) {
    return message.seq <= target.seq;
  }
  return message.createdAt <= target.createdAt;
}

export const loadTurnStatsAtom = atom(
  null,
  (get, set, turnStats: Record<string, AgentTurnCompletedEvent>) => {
    set(turnStatsByMessageAtom, {
      ...get(turnStatsByMessageAtom),
      ...turnStats,
    });
  },
);

export const bootstrapMessagesAtom = atom(
  null,
  (get, set, messages: MessageRecord[]) => {
    const buffer = get(deltaBufferAtom);
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }
    buffer.pendingDeltas.clear();
    const nextMessagesBySession: MessagesBySession = {};

    for (const message of messages) {
      const sessionMessages = nextMessagesBySession[message.sessionId] ?? [];
      nextMessagesBySession[message.sessionId] = sessionMessages;
      sessionMessages.push(message);
    }
    for (const [sessionId, sessionMessages] of Object.entries(
      nextMessagesBySession,
    )) {
      nextMessagesBySession[sessionId] = upsertMessages([], sessionMessages);
    }

    set(messagesBySessionAtom, nextMessagesBySession);
    set(
      messagesLoadedBySessionAtom,
      Object.fromEntries(
        Object.keys(nextMessagesBySession).map((sessionId) => [
          sessionId,
          true,
        ]),
      ),
    );
  },
);

export const loadSessionMessagesAtom = atom(
  null,
  (get, set, payload: { messages: MessageRecord[]; sessionId: string }) => {
    const current = get(messagesBySessionAtom);
    let nextSessionMessages = upsertMessages(
      payload.messages,
      current[payload.sessionId] ?? [],
    );

    nextSessionMessages = [...nextSessionMessages].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );

    set(messagesBySessionAtom, {
      ...current,
      [payload.sessionId]: nextSessionMessages,
    });
    set(messagesLoadedBySessionAtom, {
      ...get(messagesLoadedBySessionAtom),
      [payload.sessionId]: true,
    });
  },
);

function createDeltaMessage(
  messages: MessageRecord[],
  event: PendingDelta,
): MessageRecord {
  const existingMessage = findMessageById(messages, event.messageId);

  const nextMessage: MessageRecord = existingMessage
    ? {
        ...existingMessage,
        content: `${existingMessage.content}${event.delta}`,
        kind: event.kind ?? existingMessage.kind,
        seq: existingMessage.seq ?? event.seq,
      }
    : {
        id: event.messageId,
        sessionId: event.sessionId,
        role: "assistant",
        kind: event.kind,
        content: event.delta,
        attachments: [],
        createdAt: event.createdAt,
        seq: event.seq,
      };

  return nextMessage;
}

function flushPendingDeltas(get: Getter, set: Setter) {
  const buffer = get(deltaBufferAtom);
  const { pendingDeltas } = buffer;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = null;
  }

  if (pendingDeltas.size === 0) {
    return;
  }

  const current = get(messagesBySessionAtom);
  const nextMessagesBySession = { ...current };
  const updatesBySession = new Map<string, MessageRecord[]>();

  for (const event of pendingDeltas.values()) {
    const updates = updatesBySession.get(event.sessionId) ?? [];
    updates.push(
      createDeltaMessage(current[event.sessionId] ?? EMPTY_MESSAGES, event),
    );
    updatesBySession.set(event.sessionId, updates);
  }
  for (const [sessionId, updates] of updatesBySession) {
    nextMessagesBySession[sessionId] = upsertMessages(
      current[sessionId] ?? EMPTY_MESSAGES,
      updates,
    );
  }

  pendingDeltas.clear();
  set(messagesBySessionAtom, nextMessagesBySession);
}

function enqueueDelta(get: Getter, set: Setter, event: MessageDeltaEvent) {
  const buffer = get(deltaBufferAtom);
  const { pendingDeltas } = buffer;
  const key = getDeltaKey(event);
  const pending = pendingDeltas.get(key);

  pendingDeltas.set(key, {
    sessionId: event.sessionId,
    messageId: event.messageId,
    role: event.role,
    kind: event.kind ?? pending?.kind,
    createdAt: pending?.createdAt ?? event.createdAt,
    seq: pending?.seq ?? event.seq,
    delta: `${pending?.delta ?? ""}${event.delta}`,
  });

  if (buffer.timer) {
    return;
  }

  buffer.timer = setTimeout(() => {
    flushPendingDeltas(get, set);
  }, DELTA_FLUSH_DELAY_MS);
}

export const applyAgentEventAtom = atom(null, (get, set, event: AgentEvent) => {
  if (event.type === "state.changed") {
    return;
  }

  if (event.type === "turn.completed") {
    set(turnStatsByMessageAtom, {
      ...get(turnStatsByMessageAtom),
      [event.messageId]: event,
    });
    return;
  }

  if (event.type === "error") {
    const errorMessage: MessageRecord = event.systemMessage ?? {
      id: crypto.randomUUID(),
      sessionId: event.sessionId,
      role: "system",
      content: event.message,
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    flushPendingDeltas(get, set);
    set(appendMessageAtom, errorMessage);
    return;
  }

  if (event.type === "message.completed") {
    flushPendingDeltas(get, set);
    set(appendMessageAtom, event.message);
    return;
  }

  if (event.type !== "message.delta") {
    return;
  }

  enqueueDelta(get, set, event);
});

import type {
  AgentEvent,
  AgentTurnCompletedEvent,
  MessageRecord,
} from "@cocurdex/shared";
import type { Getter, Setter } from "jotai";
import { atom } from "jotai";

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
const pendingDeltas = new Map<string, PendingDelta>();
let deltaFlushTimer: ReturnType<typeof setTimeout> | null = null;

function getDeltaKey(event: MessageDeltaEvent) {
  return `${event.sessionId}:${event.messageId}`;
}

function upsertMessage(
  messages: MessageRecord[],
  nextMessage: MessageRecord,
): MessageRecord[] {
  const existingIndex = messages.findIndex(
    (message) => message.id === nextMessage.id,
  );

  if (existingIndex === -1) {
    return [...messages, nextMessage];
  }

  return messages.map((message, index) =>
    index === existingIndex
      ? { ...nextMessage, createdAt: message.createdAt }
      : message,
  );
}

export const appendMessageAtom = atom(
  null,
  (get, set, message: MessageRecord) => {
    const current = get(messagesBySessionAtom);
    const sessionMessages = current[message.sessionId] ?? [];

    set(messagesBySessionAtom, {
      ...current,
      [message.sessionId]: upsertMessage(sessionMessages, message),
    });
    set(messagesLoadedBySessionAtom, {
      ...get(messagesLoadedBySessionAtom),
      [message.sessionId]: true,
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
        .filter((message) => message.createdAt <= payload.message.createdAt)
        .map((message) =>
          message.id === payload.message.id ? payload.message : message,
        ),
    });
  },
);

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
  (_get, set, messages: MessageRecord[]) => {
    const nextMessagesBySession: MessagesBySession = {};

    for (const message of messages) {
      const sessionMessages = nextMessagesBySession[message.sessionId] ?? [];
      nextMessagesBySession[message.sessionId] = upsertMessage(
        sessionMessages,
        message,
      );
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
    let nextSessionMessages = payload.messages;

    for (const existingMessage of current[payload.sessionId] ?? []) {
      nextSessionMessages = upsertMessage(nextSessionMessages, existingMessage);
    }

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

function applyDeltaToMessages(
  messages: MessageRecord[],
  event: PendingDelta,
): MessageRecord[] {
  const existingMessage = messages.find(
    (message) => message.id === event.messageId,
  );

  const nextMessage: MessageRecord = existingMessage
    ? {
        ...existingMessage,
        content: `${existingMessage.content}${event.delta}`,
        kind: event.kind ?? existingMessage.kind,
      }
    : {
        id: event.messageId,
        sessionId: event.sessionId,
        role: "assistant",
        kind: event.kind,
        content: event.delta,
        attachments: [],
        createdAt: event.createdAt,
      };

  return upsertMessage(messages, nextMessage);
}

function flushPendingDeltas(get: Getter, set: Setter) {
  if (deltaFlushTimer) {
    clearTimeout(deltaFlushTimer);
    deltaFlushTimer = null;
  }

  if (pendingDeltas.size === 0) {
    return;
  }

  const current = get(messagesBySessionAtom);
  const nextMessagesBySession = { ...current };

  for (const event of pendingDeltas.values()) {
    const sessionMessages = nextMessagesBySession[event.sessionId] ?? [];
    nextMessagesBySession[event.sessionId] = applyDeltaToMessages(
      sessionMessages,
      event,
    );
  }

  pendingDeltas.clear();
  set(messagesBySessionAtom, nextMessagesBySession);

  // Only touch the loaded map when a session appears for the first time —
  // rewriting it on every flush would wake its subscribers 60 times a second.
  const loaded = get(messagesLoadedBySessionAtom);
  const newlyLoaded = Object.keys(nextMessagesBySession).filter(
    (sessionId) => !loaded[sessionId],
  );
  if (newlyLoaded.length > 0) {
    set(messagesLoadedBySessionAtom, {
      ...loaded,
      ...Object.fromEntries(newlyLoaded.map((sessionId) => [sessionId, true])),
    });
  }
}

function enqueueDelta(get: Getter, set: Setter, event: MessageDeltaEvent) {
  const key = getDeltaKey(event);
  const pending = pendingDeltas.get(key);

  pendingDeltas.set(key, {
    sessionId: event.sessionId,
    messageId: event.messageId,
    role: event.role,
    kind: event.kind ?? pending?.kind,
    createdAt: pending?.createdAt ?? event.createdAt,
    delta: `${pending?.delta ?? ""}${event.delta}`,
  });

  if (deltaFlushTimer) {
    return;
  }

  deltaFlushTimer = setTimeout(() => {
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
    const errorMessage: MessageRecord = {
      id: crypto.randomUUID(),
      sessionId: event.sessionId,
      role: "system",
      content: event.message,
      attachments: [],
      createdAt: new Date().toISOString(),
    };

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

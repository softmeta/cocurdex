import type {
  ChatEvent,
  ConversationMessageRecord,
  ConversationRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";

export const conversationsAtom = atom<ConversationRecord[]>([]);
export const activeConversationIdAtom = atom<string | null>(null);
export const conversationsLoadedAtom = atom(false);
export const messagesByConversationAtom = atom<
  Record<string, ConversationMessageRecord[]>
>({});
export const messagesLoadedAtom = atom<Record<string, boolean>>({});
const pendingLoadsAtom = atom<Record<string, ChatEvent[]>>({});
const revisionsAtom = atom<
  Record<string, { runtimeId: string; revision: number }>
>({});

export const streamingConversationIdsAtom = atom(
  (get) =>
    new Set(
      Object.entries(get(messagesByConversationAtom))
        .filter(([, messages]) =>
          messages.some((message) => message.status === "streaming"),
        )
        .map(([id]) => id),
    ),
);

export const upsertConversationAtom = atom(
  null,
  (get, set, payload: { conversation: ConversationRecord }) => {
    const next = get(conversationsAtom).filter(
      (item) => item.id !== payload.conversation.id,
    );
    if (!payload.conversation.archivedAt) next.push(payload.conversation);
    next.sort((a, b) =>
      (b.lastMessageAt ?? b.updatedAt).localeCompare(
        a.lastMessageAt ?? a.updatedAt,
      ),
    );
    set(conversationsAtom, next);
  },
);

export const removeConversationAtom = atom(null, (get, set, id: string) => {
  set(
    conversationsAtom,
    get(conversationsAtom).filter((item) => item.id !== id),
  );
  const messages = { ...get(messagesByConversationAtom) };
  delete messages[id];
  set(messagesByConversationAtom, messages);
  const loaded = { ...get(messagesLoadedAtom) };
  delete loaded[id];
  set(messagesLoadedAtom, loaded);
  if (get(activeConversationIdAtom) === id) set(activeConversationIdAtom, null);
});

const replaceConversationMessageAtom = atom(
  null,
  (get, set, message: ConversationMessageRecord) => {
    const map = get(messagesByConversationAtom);
    const list = map[message.conversationId] ?? [];
    const next = list.filter((item) => item.id !== message.id);
    next.push(message);
    next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    set(messagesByConversationAtom, { ...map, [message.conversationId]: next });
  },
);

export const applyChatEventAtom = atom(null, (get, set, event: ChatEvent) => {
  const id = event.conversationId;
  const pending = get(pendingLoadsAtom);
  if (pending[id])
    set(pendingLoadsAtom, { ...pending, [id]: [...pending[id], event] });
  const revisions = get(revisionsAtom);
  const previous = revisions[id];
  if (
    previous?.runtimeId === event.runtimeId &&
    previous.revision >= event.revision
  )
    return;
  set(revisionsAtom, {
    ...revisions,
    [id]: { runtimeId: event.runtimeId, revision: event.revision },
  });
  switch (event.type) {
    case "conversation.upserted":
      set(upsertConversationAtom, { conversation: event.conversation });
      break;
    case "conversation.deleted":
      set(removeConversationAtom, id);
      break;
    case "conversation.message.created":
    case "conversation.message.updated":
    case "conversation.message.completed":
      set(replaceConversationMessageAtom, event.message);
      break;
    case "conversation.messages.truncated":
      set(messagesByConversationAtom, {
        ...get(messagesByConversationAtom),
        [id]: event.remainingMessages,
      });
      break;
  }
});

export const loadConversationMessagesAtom = atom(
  null,
  async (get, set, id: string) => {
    if (get(pendingLoadsAtom)[id]) return;
    set(pendingLoadsAtom, { ...get(pendingLoadsAtom), [id]: [] });
    try {
      const snapshot = await desktopApi.chatGet(id);
      const events = get(pendingLoadsAtom)[id] ?? [];
      const pending = { ...get(pendingLoadsAtom) };
      delete pending[id];
      set(pendingLoadsAtom, pending);
      if (!snapshot) {
        set(removeConversationAtom, id);
        return;
      }
      set(messagesByConversationAtom, {
        ...get(messagesByConversationAtom),
        [id]: snapshot.messages,
      });
      set(upsertConversationAtom, { conversation: snapshot.conversation });
      set(revisionsAtom, {
        ...get(revisionsAtom),
        [id]: { runtimeId: snapshot.runtimeId, revision: snapshot.revision },
      });
      set(messagesLoadedAtom, { ...get(messagesLoadedAtom), [id]: true });
      for (const event of events) set(applyChatEventAtom, event);
    } finally {
      const pending = { ...get(pendingLoadsAtom) };
      delete pending[id];
      set(pendingLoadsAtom, pending);
    }
  },
);

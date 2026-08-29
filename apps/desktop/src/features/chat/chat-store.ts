import type {
  ChatEvent,
  ConversationContentPart,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSource,
  ConversationTextPart,
} from "@cocurdex/shared";
import { atom } from "jotai";

// === Atoms ===

// All non-archived conversations, sorted server-side (last_message_at DESC).
export const conversationsAtom = atom<ConversationRecord[]>([]);

// Currently focused conversation; null means "show empty/new-chat state".
export const activeConversationIdAtom = atom<string | null>(null);

// False until chatList has answered. An empty list is indistinguishable from
// "not fetched yet", so the sidebar holds its empty state back until this
// flips instead of flashing "no conversations" on every launch. Also set on
// failure so a broken IPC leaves a usable (if empty) sidebar.
export const conversationsLoadedAtom = atom(false);

// Messages by conversation id. Streaming events mutate the entry in place
// (immutably — we always replace the array reference).
export const messagesByConversationAtom = atom<
  Record<string, ConversationMessageRecord[]>
>({});

// Has a given conversation been loaded from the daemon at least once?
// Used to gate the "load" effect inside the detail view.
export const messagesLoadedAtom = atom<Record<string, boolean>>({});

// Which conversation currently has an in-flight streaming assistant message.
// The detail view uses this to render the stop button + spinner.
export const streamingConversationIdsAtom = atom<Set<string>>(
  new Set<string>(),
);

// === Writers ===

interface UpsertConversationPayload {
  conversation: ConversationRecord;
}

export const upsertConversationAtom = atom(
  null,
  (get, set, payload: UpsertConversationPayload) => {
    const list = get(conversationsAtom);
    const next = list.filter((c) => c.id !== payload.conversation.id);
    next.unshift(payload.conversation);
    // Keep the list sorted by last activity. last_message_at can be null for
    // brand new conversations — fall back to updatedAt so they still sort
    // sensibly.
    next.sort((a, b) => {
      const aKey = a.lastMessageAt ?? a.updatedAt;
      const bKey = b.lastMessageAt ?? b.updatedAt;
      return bKey.localeCompare(aKey);
    });
    set(conversationsAtom, next);
  },
);

export const removeConversationAtom = atom(
  null,
  (get, set, conversationId: string) => {
    set(
      conversationsAtom,
      get(conversationsAtom).filter((c) => c.id !== conversationId),
    );
    const messagesMap = { ...get(messagesByConversationAtom) };
    delete messagesMap[conversationId];
    set(messagesByConversationAtom, messagesMap);
    const loadedMap = { ...get(messagesLoadedAtom) };
    delete loadedMap[conversationId];
    set(messagesLoadedAtom, loadedMap);
    if (get(activeConversationIdAtom) === conversationId) {
      set(activeConversationIdAtom, null);
    }
  },
);

interface LoadMessagesPayload {
  conversationId: string;
  messages: ConversationMessageRecord[];
}

export const loadConversationMessagesAtom = atom(
  null,
  (get, set, payload: LoadMessagesPayload) => {
    set(messagesByConversationAtom, {
      ...get(messagesByConversationAtom),
      [payload.conversationId]: payload.messages,
    });
    set(messagesLoadedAtom, {
      ...get(messagesLoadedAtom),
      [payload.conversationId]: true,
    });
  },
);

function upsertMessageInList(
  list: ConversationMessageRecord[],
  message: ConversationMessageRecord,
): ConversationMessageRecord[] {
  const existingIndex = list.findIndex((m) => m.id === message.id);
  if (existingIndex === -1) {
    return [...list, message].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }
  const next = [...list];
  next[existingIndex] = message;
  return next;
}

// Append a non-streaming message (e.g. user echo from chat:sendMessage).
export const appendConversationMessageAtom = atom(
  null,
  (get, set, message: ConversationMessageRecord) => {
    const current =
      get(messagesByConversationAtom)[message.conversationId] ?? [];
    set(messagesByConversationAtom, {
      ...get(messagesByConversationAtom),
      [message.conversationId]: upsertMessageInList(current, message),
    });
  },
);

function nextStreamingSet(
  current: Set<string>,
  conversationId: string,
  on: boolean,
) {
  const next = new Set(current);
  if (on) next.add(conversationId);
  else next.delete(conversationId);
  return next;
}

// Main fan-in for chat:event broadcasts.
export const applyChatEventAtom = atom(null, (get, set, event: ChatEvent) => {
  switch (event.type) {
    case "conversation.upserted": {
      set(upsertConversationAtom, { conversation: event.conversation });
      return;
    }
    case "conversation.deleted": {
      set(removeConversationAtom, event.conversationId);
      return;
    }
    case "conversation.message.created": {
      set(appendConversationMessageAtom, event.message);
      if (
        event.message.role === "assistant" &&
        event.message.status === "streaming"
      ) {
        set(
          streamingConversationIdsAtom,
          nextStreamingSet(
            get(streamingConversationIdsAtom),
            event.conversationId,
            true,
          ),
        );
      }
      return;
    }
    case "conversation.message.delta": {
      const current =
        get(messagesByConversationAtom)[event.conversationId] ?? [];
      const idx = current.findIndex((m) => m.id === event.messageId);
      if (idx === -1) return;
      const existing = current[idx];
      // Merge into the last text part so streaming text in one tool-call
      // turn stays contiguous. If the last part is a tool result we append a
      // fresh text part so the assistant's narration doesn't bleed into the
      // tool block.
      const lastPart = existing.content[existing.content.length - 1];
      const nextContent: ConversationContentPart[] =
        lastPart && lastPart.type === "text"
          ? existing.content.map((p, i) =>
              i === existing.content.length - 1
                ? ({
                    ...(p as ConversationTextPart),
                    text: (p as ConversationTextPart).text + event.delta,
                  } satisfies ConversationTextPart)
                : p,
            )
          : [...existing.content, { type: "text", text: event.delta }];
      const nextMessage: ConversationMessageRecord = {
        ...existing,
        content: nextContent,
        updatedAt: new Date().toISOString(),
      };
      const nextList = [...current];
      nextList[idx] = nextMessage;
      set(messagesByConversationAtom, {
        ...get(messagesByConversationAtom),
        [event.conversationId]: nextList,
      });
      return;
    }
    case "conversation.message.source": {
      const map = get(messagesByConversationAtom);
      const current = map[event.conversationId] ?? [];
      const idx = current.findIndex((m) => m.id === event.messageId);
      if (idx === -1) return;
      const next = [...current];
      next[idx] = {
        ...next[idx],
        sources: dedupeSources([...next[idx].sources, event.source]),
      };
      set(messagesByConversationAtom, {
        ...map,
        [event.conversationId]: next,
      });
      return;
    }
    case "conversation.message.usage": {
      const map = get(messagesByConversationAtom);
      const current = map[event.conversationId] ?? [];
      const idx = current.findIndex((m) => m.id === event.messageId);
      if (idx === -1) return;
      const next = [...current];
      next[idx] = { ...next[idx], usage: event.usage };
      set(messagesByConversationAtom, {
        ...map,
        [event.conversationId]: next,
      });
      return;
    }
    case "conversation.message.tool-call":
    case "conversation.message.tool-result": {
      // For provider-hosted web search these are bookkeeping signals — the UI
      // doesn't yet render per-step chips. The completed message will carry
      // sources, which is what users actually care about.
      return;
    }
    case "conversation.message.completed": {
      // Server is authoritative — replace the in-flight record entirely.
      const current =
        get(messagesByConversationAtom)[event.conversationId] ?? [];
      set(messagesByConversationAtom, {
        ...get(messagesByConversationAtom),
        [event.conversationId]: upsertMessageInList(current, event.message),
      });
      set(
        streamingConversationIdsAtom,
        nextStreamingSet(
          get(streamingConversationIdsAtom),
          event.conversationId,
          false,
        ),
      );
      return;
    }
    case "conversation.message.errored": {
      const map = get(messagesByConversationAtom);
      const current = map[event.conversationId] ?? [];
      const idx = current.findIndex((m) => m.id === event.messageId);
      if (idx !== -1) {
        const next = [...current];
        next[idx] = { ...next[idx], status: "errored", error: event.error };
        set(messagesByConversationAtom, {
          ...map,
          [event.conversationId]: next,
        });
      }
      set(
        streamingConversationIdsAtom,
        nextStreamingSet(
          get(streamingConversationIdsAtom),
          event.conversationId,
          false,
        ),
      );
      return;
    }
    case "conversation.messages.truncated": {
      set(messagesByConversationAtom, {
        ...get(messagesByConversationAtom),
        [event.conversationId]: event.remainingMessages,
      });
      set(
        streamingConversationIdsAtom,
        nextStreamingSet(
          get(streamingConversationIdsAtom),
          event.conversationId,
          false,
        ),
      );
      return;
    }
  }
});

function dedupeSources(sources: ConversationSource[]): ConversationSource[] {
  const seen = new Set<string>();
  const out: ConversationSource[] = [];
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    out.push(source);
  }
  return out;
}

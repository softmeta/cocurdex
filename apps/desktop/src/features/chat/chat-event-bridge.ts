import { useSetAtom, useStore } from "jotai";
import { desktopApi, useMountEffect } from "@/lib";
import {
  activeConversationIdAtom,
  applyChatEventAtom,
  conversationsAtom,
  conversationsLoadedAtom,
  loadConversationMessagesAtom,
  messagesLoadedAtom,
} from "./chat-store";

export function useChatEventBridge() {
  const applyEvent = useSetAtom(applyChatEventAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const setLoaded = useSetAtom(conversationsLoadedAtom);
  const store = useStore();
  useMountEffect(() => {
    let cancelled = false;
    let generation = 0;
    let changed = new Set<string>();
    const refresh = () => {
      const current = ++generation;
      changed = new Set();
      const changedDuringLoad = changed;
      void desktopApi
        .chatList()
        .then((list) => {
          if (cancelled || current !== generation) return;
          setConversations((existing) =>
            [
              ...list.filter((item) => !changedDuringLoad.has(item.id)),
              ...existing.filter((item) => changedDuringLoad.has(item.id)),
            ].sort((a, b) =>
              (b.lastMessageAt ?? b.updatedAt).localeCompare(
                a.lastMessageAt ?? a.updatedAt,
              ),
            ),
          );
        })
        .catch((error) => {
          console.error("[Chat] list failed", error);
        })
        .finally(() => {
          if (!cancelled && current === generation) setLoaded(true);
        });
      const ids = new Set(Object.keys(store.get(messagesLoadedAtom)));
      const active = store.get(activeConversationIdAtom);
      if (active) ids.add(active);
      for (const id of ids) {
        void store
          .set(loadConversationMessagesAtom, id)
          .catch((error) => console.error("[Chat] recovery failed", error));
      }
    };
    const unsubscribe = desktopApi.onChatEvent((event) => {
      changed.add(event.conversationId);
      applyEvent(event);
    });
    const unsubscribeInvalidated = desktopApi.onChatInvalidated(refresh);
    refresh();
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeInvalidated();
    };
  });
}

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { desktopApi } from "@/lib";
import {
  applyChatEventAtom,
  conversationsAtom,
  conversationsLoadedAtom,
} from "./chat-store";

// Mounted once near the app root. Subscribes to the daemon's chat:event channel
// and hydrates the conversation list on startup. Kept as a hook (not a
// component) so the call site is explicit about lifecycle.
export function useChatEventBridge() {
  const applyEvent = useSetAtom(applyChatEventAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const setConversationsLoaded = useSetAtom(conversationsLoadedAtom);

  useEffect(() => {
    let cancelled = false;
    void desktopApi
      .chatList()
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((error) => {
        console.error("[Chat] list failed", error);
      })
      .finally(() => {
        if (!cancelled) setConversationsLoaded(true);
      });
    const unsubscribe = desktopApi.onChatEvent((event) => {
      applyEvent(event);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyEvent, setConversations, setConversationsLoaded]);
}

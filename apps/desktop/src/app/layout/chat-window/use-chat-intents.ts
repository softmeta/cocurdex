import { useEffectEvent } from "react";
import type { ChatWindowIntent } from "@/lib/chat-window-types";
import { desktopApi } from "@/lib/ipc";
import { useMountEffect } from "@/lib/react-hooks";

// Pull/ack loop for surface-addressed intents whose resolved target is this
// window (see registerChatWindowContext in the main process for the surface →
// window routing). The handler returns true once an intent is consumed so the
// loop can acknowledge it; any other result leaves the request queued for a
// later retry or for whichever consumer owns that kind.
export function useChatWindowIntents(
  handle: (intent: ChatWindowIntent) => boolean,
) {
  const onIntent = useEffectEvent(handle);
  useMountEffect(() => {
    const api = desktopApi.chatWindow;
    if (!api.onIntentAvailable) return;
    let disposed = false;
    const handled = new Set<string>();
    const receive = async () => {
      const pending = await api.getPendingIntents();
      if (disposed) return;
      for (const request of pending) {
        if (handled.has(request.id)) continue;
        if (onIntent(request.intent) !== true) continue;
        handled.add(request.id);
        await api.acknowledgeIntent(request.id);
      }
    };
    const refresh = () => {
      void receive().catch(console.error);
    };
    const unsubscribe = api.onIntentAvailable(refresh);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  });
}

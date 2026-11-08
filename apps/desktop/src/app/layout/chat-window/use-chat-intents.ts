import { useEffectEvent } from "react";
import type { ChatWindowIntent } from "@/lib/chat-window-types";
import { desktopApi } from "@/lib/ipc";
import { useMountEffect } from "@/lib/react-hooks";

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

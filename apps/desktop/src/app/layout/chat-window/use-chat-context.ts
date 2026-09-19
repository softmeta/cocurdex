import { useStore } from "jotai";
import { useCallback, useEffectEvent, useRef } from "react";
import { toast } from "sonner";
import type { ChatComposerHandle } from "@/features/composer";
import {
  outgoingChatContextAtom,
  removeOutgoingChatContextAtom,
} from "@/lib/chat-context-store";
import { desktopApi } from "@/lib/ipc";
import { useMountEffect } from "@/lib/react-hooks";
import {
  chatWindowBusyAtom,
  chatWindowStateAtom,
  isDetachedChatWindow,
} from "./chat-window-state";

export function useChatContext(onReveal: () => void) {
  const store = useStore();
  const reveal = useEffectEvent(onReveal);
  const receiver = useRef<{
    composer: ChatComposerHandle | null;
    refresh(): void;
  }>({ composer: null, refresh: () => {} });
  const composerRef = useCallback((composer: ChatComposerHandle | null) => {
    receiver.current.composer = composer;
    queueMicrotask(() => receiver.current.refresh());
  }, []);

  useMountEffect(() => {
    const api = desktopApi.chatWindow;
    if (!api.onIntentAvailable) return;
    let disposed = false;
    const delivered = new Set<string>();
    const forwarding = new Set<string>();
    const report = (error: unknown) => {
      if (!disposed)
        toast.error(error instanceof Error ? error.message : String(error));
    };
    const canReceive = () => {
      const state = store.get(chatWindowStateAtom);
      return (
        !store.get(chatWindowBusyAtom) &&
        !state.transitioning &&
        state.detached === isDetachedChatWindow
      );
    };
    const receive = async () => {
      const pending = await api.getPendingIntents();
      if (disposed || !canReceive()) return;
      let revealed = false;
      for (const request of pending) {
        if (request.intent.kind !== "composer-input") continue;
        if (!canReceive()) return;
        if (!revealed) {
          reveal();
          revealed = true;
        }
        if (!delivered.has(request.id)) {
          const composer = receiver.current.composer;
          if (!composer) return;
          const { input } = request.intent;
          const inserted =
            input.kind === "text"
              ? composer.insertText(input.text)
              : composer.insertContextMention(input.attachment);
          if (!inserted) return;
          delivered.add(request.id);
        }
        await api.acknowledgeIntent(request.id);
      }
    };
    const refresh = () => {
      void receive().catch(report);
    };
    const forward = () => {
      for (const request of store.get(outgoingChatContextAtom)) {
        if (forwarding.has(request.id)) continue;
        forwarding.add(request.id);
        void api
          .dispatchIntent({
            id: request.id,
            surface: "chat",
            intent: { kind: "composer-input", input: request.input },
          })
          .then(() => {
            store.set(removeOutgoingChatContextAtom, request.id);
          })
          .catch(report)
          .finally(() => {
            forwarding.delete(request.id);
          });
      }
    };
    receiver.current.refresh = refresh;
    const unsubscribeContext = api.onIntentAvailable(refresh);
    const unsubscribeOutgoing = store.sub(outgoingChatContextAtom, forward);
    const unsubscribeState = store.sub(chatWindowStateAtom, refresh);
    const unsubscribeBusy = store.sub(chatWindowBusyAtom, refresh);
    window.addEventListener("focus", refresh);
    forward();
    refresh();
    return () => {
      disposed = true;
      receiver.current.refresh = () => {};
      unsubscribeContext();
      unsubscribeOutgoing();
      unsubscribeState();
      unsubscribeBusy();
      window.removeEventListener("focus", refresh);
    };
  });
  return composerRef;
}

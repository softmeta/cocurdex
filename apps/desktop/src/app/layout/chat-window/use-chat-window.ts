import { useAtomValue, useStore } from "jotai";
import { useEffectEvent } from "react";
import { toast } from "sonner";
import { composerPendingOperationsAtom } from "@/features/composer";
import { editorPanelOpenAtom } from "@/features/editor";
import { desktopApi, useMountEffect } from "@/lib";
import type { ChatWindowTransfer } from "@/lib/chat-window-types";
import { appBootstrappedAtom } from "../app-shell/app-bootstrap-store";
import {
  applyChatSnapshot,
  hydrateChatWindow,
  serializeChatSnapshot,
} from "./chat-window-snapshot";
import {
  chatWindowBusyAtom,
  chatWindowStateAtom,
  isDetachedChatWindow,
} from "./chat-window-state";

export function useChatWindowActions() {
  const store = useStore();
  const state = useAtomValue(chatWindowStateAtom);
  const transferring = useAtomValue(chatWindowBusyAtom) || state.transitioning;
  const pendingOperations = useAtomValue(composerPendingOperationsAtom);
  const busy = transferring || pendingOperations > 0;
  const editorPanelOpen = useAtomValue(editorPanelOpenAtom);
  const canMove = isDetachedChatWindow || editorPanelOpen;
  const move = async () => {
    if (
      !canMove ||
      store.get(chatWindowBusyAtom) ||
      store.get(composerPendingOperationsAtom) > 0
    )
      return;
    store.set(chatWindowBusyAtom, true);
    try {
      const snapshot = serializeChatSnapshot(store);
      if (isDetachedChatWindow) await desktopApi.chatWindow.reattach(snapshot);
      else await desktopApi.chatWindow.detach(snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      store.set(chatWindowBusyAtom, false);
    }
  };
  const focus = () => {
    void desktopApi.chatWindow.focus().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
  };
  const toggleVisibility = () => {
    void desktopApi.chatWindow.toggleVisibility().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
  };
  return {
    busy,
    canMove,
    transferring,
    detached: state.detached,
    move,
    focus,
    toggleVisibility,
    isDetachedChatWindow,
  };
}

export function useMainChatWindow(
  onReturn: () => void,
  synchronize: (ids: string[]) => Promise<void>,
) {
  const revealChat = useEffectEvent(onReturn);
  const store = useStore();
  useMountEffect(() => {
    if (!window.desktopApi?.chatWindow) return;
    let disposed = false;
    let receivedState = false;
    const applying = new Set<string>();
    const receive = async (transfer: ChatWindowTransfer) => {
      if (disposed || applying.has(transfer.id)) return;
      applying.add(transfer.id);
      try {
        await hydrateChatWindow(store, transfer.snapshot, synchronize);
        if (disposed) return;
        applyChatSnapshot(store, transfer.snapshot);
        revealChat();
        await desktopApi.chatWindow.ready(transfer.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        applying.delete(transfer.id);
      }
    };
    const checkPending = () => {
      if (!store.get(appBootstrappedAtom)) return;
      void desktopApi.chatWindow
        .bootstrap()
        .then((transfer) => {
          if (transfer) void receive(transfer);
        })
        .catch(console.error);
    };
    const unsubscribeState = desktopApi.chatWindow.onState((state) => {
      receivedState = true;
      store.set(chatWindowStateAtom, state);
    });
    const unsubscribeTransfer = desktopApi.chatWindow.onTransfer((transfer) => {
      if (store.get(appBootstrappedAtom)) void receive(transfer);
    });
    const unsubscribeBootstrap = store.sub(appBootstrappedAtom, checkPending);
    void desktopApi.chatWindow
      .getState()
      .then((state) => {
        if (!disposed && !receivedState) store.set(chatWindowStateAtom, state);
        if (!disposed) checkPending();
      })
      .catch(console.error);
    return () => {
      disposed = true;
      unsubscribeState();
      unsubscribeTransfer();
      unsubscribeBootstrap();
    };
  });
}

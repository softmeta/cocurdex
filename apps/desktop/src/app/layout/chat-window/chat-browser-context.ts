import type { BrowserAnnotation } from "@cocurdex/shared";
import { atom, useStore } from "jotai";
import { annotationsAtom } from "@/features/browser";
import { desktopApi } from "@/lib/ipc";
import { useMountEffect } from "@/lib/react-hooks";
import { isDetachedChatWindow } from "./chat-window-state";

const detachedAnnotationsAtom = atom<BrowserAnnotation[]>([]);
export const chatBrowserAnnotationsAtom = atom((get) =>
  get(isDetachedChatWindow ? detachedAnnotationsAtom : annotationsAtom),
);

export function useChatBrowserContext() {
  const store = useStore();
  useMountEffect(() => {
    const api = desktopApi.chatWindow;
    if (!api.onBrowserContext) return;
    if (!isDetachedChatWindow) {
      const publish = () => {
        void api
          .setBrowserContext(store.get(annotationsAtom))
          .catch(console.error);
      };
      const unsubscribe = store.sub(annotationsAtom, publish);
      publish();
      return unsubscribe;
    }
    let received = false;
    let disposed = false;
    const unsubscribe = api.onBrowserContext((annotations) => {
      received = true;
      store.set(detachedAnnotationsAtom, annotations);
    });
    void api
      .getBrowserContext()
      .then((annotations) => {
        if (!disposed && !received)
          store.set(detachedAnnotationsAtom, annotations);
      })
      .catch(console.error);
    return () => {
      disposed = true;
      unsubscribe();
    };
  });
}

import type { BrowserAnnotation } from "@cocurdex/shared";
import { atom, useStore } from "jotai";
import { toast } from "sonner";
import { annotationsAtom } from "@/features/browser";
import { onOpenHtmlPreview } from "@/lib/browser-preview-events";
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

// Detached-window side of the HTML preview flow. The main window's browser
// event bridge is not mounted here, so the in-window CustomEvent from
// openHtmlPreviewInBrowser would go unanswered. The BrowserView itself is host
// IPC and works from any window — what the shell needs is a show-panel intent
// so the right panel flips to the browser view.
export function useChatBrowserPreviewBridge() {
  useMountEffect(() => {
    if (!isDetachedChatWindow) return;
    return onOpenHtmlPreview((html, resolve, sourceId, streaming) => {
      void desktopApi.chatWindow
        .dispatchIntent({
          surface: "shell",
          intent: { kind: "show-panel", view: "browser" },
        })
        .catch(console.error);
      void desktopApi
        .browserOpenHtml(html, sourceId, streaming)
        .then(resolve)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
          resolve(null);
        });
    });
  });
}

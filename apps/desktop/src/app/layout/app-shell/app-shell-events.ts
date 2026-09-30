import { useSetAtom } from "jotai";
import { useEffectEvent } from "react";
import { toast } from "sonner";
import { addAnnotationAtom, receiveBrowserTabsAtom } from "@/features/browser";
import { editorPanelOpenAtom } from "@/features/editor";
import { desktopApi, onOpenHtmlPreview, useMountEffect } from "@/lib";
import { bumpRightPanelRevealAtom } from "../right-panel-reveal";

export function useBrowserEventBridge() {
  const setEditorPanelOpen = useSetAtom(editorPanelOpenAtom);
  const revealPanel = useSetAtom(bumpRightPanelRevealAtom);
  const receiveTabs = useSetAtom(receiveBrowserTabsAtom);
  const addAnnotation = useSetAtom(addAnnotationAtom);
  const open = useEffectEvent(
    (
      html: string,
      resolve: (url: string | null) => void,
      sourceId: string,
      streaming: boolean,
    ) => {
      setEditorPanelOpen(true);
      revealPanel("browser");
      void desktopApi
        .browserOpenHtml(html, sourceId, streaming)
        .then(resolve)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
          resolve(null);
        });
    },
  );
  useMountEffect(() => {
    let received = false;
    let disposed = false;
    const unsubscribeTabs = desktopApi.onBrowserTabs((snapshot) => {
      received = true;
      receiveTabs(snapshot);
    });
    void desktopApi.browserListTabs().then((snapshot) => {
      if (!received && !disposed) receiveTabs(snapshot);
    });
    const unsubscribeHtml = onOpenHtmlPreview(
      (html, resolve, sourceId, streaming) =>
        open(html, resolve, sourceId, streaming),
    );
    const unsubscribeAnnotation = desktopApi.onBrowserAnnotation(
      ({ tabId, annotation }) => addAnnotation(annotation, tabId),
    );
    return () => {
      disposed = true;
      unsubscribeTabs();
      unsubscribeHtml();
      unsubscribeAnnotation();
    };
  });
}

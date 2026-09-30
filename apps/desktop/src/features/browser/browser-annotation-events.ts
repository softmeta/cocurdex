import type { BrowserAnnotation } from "@cocurdex/shared";
import type { createStore } from "jotai";
import { toast } from "sonner";
import { desktopApi } from "@/lib";
import {
  addAnnotationAtom,
  annotationsByTabAtom,
  isAnnotationModeAtom,
  removeAnnotationsAtom,
} from "./browser-store";

type Store = ReturnType<typeof createStore>;

function report(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error));
}

function sendAnnotations(annotations: BrowserAnnotation[]) {
  if (annotations.length === 0) return;
  void desktopApi.chatWindow
    .dispatchIntent({
      surface: "chat",
      intent: { kind: "send-browser-annotations", annotations },
    })
    .catch(report);
}

export function bindBrowserAnnotationEvents(store: Store) {
  const tabAnnotations = (tabId: string) =>
    store.get(annotationsByTabAtom)[tabId] ?? [];
  const unsubscribeAnnotation = desktopApi.onBrowserAnnotation(
    ({ tabId, annotation, submit }) => {
      store.set(addAnnotationAtom, annotation, tabId);
      if (submit) sendAnnotations(tabAnnotations(tabId));
    },
  );
  const unsubscribeAction = desktopApi.onBrowserAnnotationAction(
    ({ tabId, action }) => {
      if (action === "send") sendAnnotations(tabAnnotations(tabId));
      if (action === "clear") {
        const ids = tabAnnotations(tabId).map((annotation) => annotation.id);
        store.set(removeAnnotationsAtom, ids);
      }
      if (action === "exit") {
        store.set(isAnnotationModeAtom, false);
        void desktopApi.browserToggleAnnotationMode(false).catch(report);
      }
    },
  );
  const unsubscribeMarkers = store.sub(annotationsByTabAtom, () => {
    for (const [tabId, list] of Object.entries(store.get(annotationsByTabAtom)))
      void desktopApi
        .browserSetAnnotationMarkers(
          tabId,
          list.map((annotation) => annotation.id),
        )
        .catch(report);
  });
  return () => {
    unsubscribeAnnotation();
    unsubscribeAction();
    unsubscribeMarkers();
  };
}

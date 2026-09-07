import type { BrowserAnnotation, BrowserTabsSnapshot } from "@cocurdex/shared";
import { atom } from "jotai";

export const browserTabsAtom = atom<BrowserTabsSnapshot>({
  tabs: [],
  activeId: null,
});
const activeTabAtom = atom((get) => {
  const snapshot = get(browserTabsAtom);
  return snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
});
export const browserUrlAtom = atom((get) => get(activeTabAtom)?.url ?? "");
export const browserTitleAtom = atom((get) => get(activeTabAtom)?.title ?? "");
export const browserErrorAtom = atom(
  (get) => get(activeTabAtom)?.error ?? null,
);
export const isBrowserLoadingAtom = atom(
  (get) => get(activeTabAtom)?.loading ?? false,
);
export const isBrowserStreamingAtom = atom(
  (get) => get(activeTabAtom)?.streaming ?? false,
);
const tabAnnotationsAtom = atom<Record<string, BrowserAnnotation[]>>({});
const annotationModesAtom = atom<Record<string, boolean>>({});
export const annotationsAtom = atom((get) => {
  const id = get(browserTabsAtom).activeId;
  return (id && get(tabAnnotationsAtom)[id]) || [];
});
export const isAnnotationModeAtom = atom(
  (get) => {
    const id = get(browserTabsAtom).activeId;
    return (id && get(annotationModesAtom)[id]) || false;
  },
  (get, set, enabled: boolean) => {
    const id = get(browserTabsAtom).activeId;
    if (id)
      set(annotationModesAtom, { ...get(annotationModesAtom), [id]: enabled });
  },
);
export const annotationCountAtom = atom((get) => get(annotationsAtom).length);

export const receiveBrowserTabsAtom = atom(
  null,
  (get, set, snapshot: BrowserTabsSnapshot) => {
    set(browserTabsAtom, snapshot);
    const ids = new Set(snapshot.tabs.map((tab) => tab.id));
    set(
      tabAnnotationsAtom,
      Object.fromEntries(
        Object.entries(get(tabAnnotationsAtom)).filter(([id]) => ids.has(id)),
      ),
    );
    set(
      annotationModesAtom,
      Object.fromEntries(
        Object.entries(get(annotationModesAtom)).filter(([id]) => ids.has(id)),
      ),
    );
  },
);

export const addAnnotationAtom = atom(
  null,
  (get, set, annotation: BrowserAnnotation, tabId?: string) => {
    const id = tabId ?? get(browserTabsAtom).activeId;
    if (!id || !get(browserTabsAtom).tabs.some((tab) => tab.id === id)) return;
    const all = get(tabAnnotationsAtom);
    set(tabAnnotationsAtom, { ...all, [id]: [...(all[id] ?? []), annotation] });
  },
);
export const removeAnnotationAtom = atom(
  null,
  (get, set, annotationId: string) => {
    const id = get(browserTabsAtom).activeId;
    if (!id) return;
    set(tabAnnotationsAtom, {
      ...get(tabAnnotationsAtom),
      [id]: get(annotationsAtom).filter((a) => a.id !== annotationId),
    });
  },
);
export const clearAnnotationsAtom = atom(null, (get, set) => {
  const id = get(browserTabsAtom).activeId;
  if (id) set(tabAnnotationsAtom, { ...get(tabAnnotationsAtom), [id]: [] });
});

import type { BrowserAnnotation } from "@cocurdex/shared";
import { atom } from "jotai";

export const browserUrlAtom = atom("");
export const isAnnotationModeAtom = atom(false);
export const annotationsAtom = atom<BrowserAnnotation[]>([]);
export const isBrowserLoadingAtom = atom(false);
export const browserTitleAtom = atom("");
export const browserErrorAtom = atom<string | null>(null);
export const annotationCountAtom = atom((get) => get(annotationsAtom).length);
export const browserUrlInputAtom = atom("");

export const addAnnotationAtom = atom(
  null,
  (get, set, annotation: BrowserAnnotation) => {
    const current = get(annotationsAtom);
    set(annotationsAtom, [...current, annotation]);
  },
);

export const removeAnnotationAtom = atom(
  null,
  (get, set, annotationId: string) => {
    const current = get(annotationsAtom);
    set(
      annotationsAtom,
      current.filter((a) => a.id !== annotationId),
    );
  },
);

export const clearAnnotationsAtom = atom(null, (_get, set) => {
  set(annotationsAtom, []);
});

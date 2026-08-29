import { atom } from "jotai";

// Shared last-wins reveal for the right panel. Editor open and PDF open both
// bump this clock; the panel shows whichever view was requested most recently.
// Lives in a leaf module so editor-store and pdf-reader-store can write without
// importing the full right-panel store (avoids cycles with openPdfsAtom).

export type RightPanelRevealView = "editor" | "pdf";

export interface RightPanelRevealIntent {
  view: RightPanelRevealView;
  clock: number;
}

export const rightPanelRevealIntentAtom = atom<RightPanelRevealIntent | null>(
  null,
);

export const rightPanelHandledRevealClockAtom = atom(0);

export const bumpRightPanelRevealAtom = atom(
  null,
  (get, set, view: RightPanelRevealView) => {
    const prev = get(rightPanelRevealIntentAtom);
    set(rightPanelRevealIntentAtom, {
      view,
      clock: (prev?.clock ?? 0) + 1,
    });
  },
);

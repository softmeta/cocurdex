import { atom } from "jotai";

export type RightPanelRevealView = "editor" | "pdf" | "browser";

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

import { atom } from "jotai";

export const routineScopeAtom = atom("all");
export const routineSelectionAtom = atom<string | null>(null);

import type { NoteRecord, NoteSummary } from "@cocurdex/shared";
import { atom } from "jotai";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

export interface ActiveNoteDoc {
  noteId: string;
  state: Uint8Array;
}

export const noteSummariesAtom = atom<NoteSummary[]>([]);
export const activeNoteIdAtom = atom<string | null>(null);
export const activeNoteAtom = atom<NoteRecord | null>(null);
export const activeNoteDocAtom = atom<ActiveNoteDoc | null>(null);
export const notesLoadingAtom = atom(false);
export const noteSaveStatusAtom = atom<NoteSaveStatus>("idle");
export const notesRevealNonceAtom = atom(0);
export const noteTitleEpochAtom = atom(0);

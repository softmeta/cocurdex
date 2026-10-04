import type { NoteRecord, NoteSummary } from "@cocurdex/shared";
import { atom } from "jotai";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export const noteSummariesAtom = atom<NoteSummary[]>([]);
export const activeNoteIdAtom = atom<string | null>(null);
export const activeNoteAtom = atom<NoteRecord | null>(null);
export const notesLoadingAtom = atom(false);
export const noteSaveStatusAtom = atom<NoteSaveStatus>("idle");
export const noteEditorDirtyAtom = atom(false);
export const noteSaveConflictsAtom = atom<Record<string, NoteRecord>>({});
export const notesRevealNonceAtom = atom(0);
export const noteContentEpochAtom = atom(0);

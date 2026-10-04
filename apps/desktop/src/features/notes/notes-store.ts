import type { NoteKind, NoteRecord, NoteSummary } from "@cocurdex/shared";
import { atom } from "jotai";
import {
  forgetNote,
  getKnownNote,
  getLocalNote,
  hasPendingNoteSave,
  hasUnsavedNoteChange,
  rememberNoteRecord,
  saveNoteChangeAtom,
  waitForNoteSaves,
} from "./note-save-store";
import {
  activeNoteAtom,
  activeNoteIdAtom,
  noteContentEpochAtom,
  noteEditorDirtyAtom,
  noteSaveStatusAtom,
  noteSummariesAtom,
  notesLoadingAtom,
  notesRevealNonceAtom,
} from "./notes-atoms";
import { notesIpc } from "./notes-ipc";

export {
  activeNoteAtom,
  activeNoteIdAtom,
  type NoteSaveStatus,
  noteContentEpochAtom,
  noteEditorDirtyAtom,
  noteSaveConflictsAtom,
  noteSaveStatusAtom,
  noteSummariesAtom,
  notesLoadingAtom,
  notesRevealNonceAtom,
} from "./notes-atoms";

export const loadNotesAtom = atom(null, async (_get, set) => {
  set(notesLoadingAtom, true);
  try {
    set(noteSummariesAtom, await notesIpc.list());
  } finally {
    set(notesLoadingAtom, false);
  }
});

export const openNoteAtom = atom(null, async (get, set, noteId: string) => {
  if (get(activeNoteIdAtom) === noteId) {
    return;
  }

  set(activeNoteIdAtom, noteId);
  set(noteSaveStatusAtom, "idle");
  set(noteEditorDirtyAtom, false);
  await waitForNoteSaves(noteId);
  const note = hasUnsavedNoteChange(noteId)
    ? getLocalNote(noteId)
    : await notesIpc.get({ id: noteId });
  if (note) {
    rememberNoteRecord(note);
  }
  if (get(activeNoteIdAtom) === noteId) {
    set(activeNoteAtom, note);
  }
});

export type CreateNoteInput =
  | string
  | null
  | {
      parentId?: string | null;
      title?: string;
      kind?: NoteKind;
    };

function normalizeCreateNoteInput(input: CreateNoteInput = null) {
  if (input === null || typeof input === "string") {
    return { parentId: input, kind: "note" as const };
  }

  return {
    parentId: input.parentId ?? null,
    title: input.title,
    kind: input.kind ?? "note",
  };
}

export const createNoteAtom = atom(
  null,
  async (get, set, input: CreateNoteInput = null) => {
    const { parentId, title, kind } = normalizeCreateNoteInput(input);
    const note = await notesIpc.create({
      parentId,
      kind,
      title: title?.trim() ? title.trim() : undefined,
    });
    rememberNoteRecord(note);
    set(noteSummariesAtom, [...get(noteSummariesAtom), toSummary(note)]);
    set(activeNoteIdAtom, note.id);
    set(activeNoteAtom, note);
    set(noteSaveStatusAtom, "idle");
    set(noteEditorDirtyAtom, false);
    set(notesRevealNonceAtom, get(notesRevealNonceAtom) + 1);
    return note;
  },
);

export const moveNoteAtom = atom(
  null,
  async (
    get,
    set,
    payload: { id: string; parentId: string | null },
  ): Promise<NoteRecord> => {
    await waitForNoteSaves(payload.id);
    const moved = await notesIpc.move(payload);
    rememberNoteRecord(moved);
    set(noteSummariesAtom, await notesIpc.list());
    const current = get(activeNoteAtom);
    if (current?.id === moved.id) {
      set(activeNoteAtom, { ...moved, bodyMarkdown: current.bodyMarkdown });
    }
    set(notesRevealNonceAtom, get(notesRevealNonceAtom) + 1);
    return moved;
  },
);

export const deleteNoteAtom = atom(null, async (get, set, noteId: string) => {
  await waitForNoteSaves(noteId);
  await notesIpc.delete({ id: noteId });
  forgetNote(noteId);
  const summaries = await notesIpc.list();
  set(noteSummariesAtom, summaries);
  if (!summaries.some((note) => note.id === get(activeNoteIdAtom))) {
    set(activeNoteIdAtom, null);
    set(activeNoteAtom, null);
  }
});

export const renameNoteAtom = atom(
  null,
  async (
    _get,
    set,
    payload: { id: string; title: string },
  ): Promise<NoteRecord> => {
    await set(saveNoteChangeAtom, {
      noteId: payload.id,
      change: { title: payload.title },
    });
    const known = getKnownNote(payload.id);
    if (!known || hasUnsavedNoteChange(payload.id)) {
      throw new Error(`Note rename was not saved: ${payload.id}`);
    }
    return known;
  },
);

export const refreshNotesAtom = atom(null, async (get, set) => {
  if (get(notesLoadingAtom)) {
    return;
  }

  try {
    const summaries = await notesIpc.list();
    set(noteSummariesAtom, summaries);
    const activeId = get(activeNoteIdAtom);
    if (!activeId) {
      return;
    }

    const summary = summaries.find((note) => note.id === activeId);
    if (!summary) {
      forgetNote(activeId);
      set(activeNoteIdAtom, null);
      set(activeNoteAtom, null);
      set(noteEditorDirtyAtom, false);
      return;
    }

    const current = get(activeNoteAtom);
    if (current?.revision === summary.revision) {
      return;
    }
    if (get(noteEditorDirtyAtom) || hasPendingNoteSave(activeId)) {
      return;
    }

    const fresh = await notesIpc.get({ id: activeId });
    if (
      get(activeNoteIdAtom) === activeId &&
      fresh &&
      !get(noteEditorDirtyAtom) &&
      !hasPendingNoteSave(activeId)
    ) {
      rememberNoteRecord(fresh);
      set(activeNoteAtom, fresh);
      set(noteContentEpochAtom, get(noteContentEpochAtom) + 1);
    }
  } catch {
    // External refresh is best-effort; preserve the current editor state.
  }
});

function toSummary(note: NoteRecord): NoteSummary {
  const { bodyMarkdown: _bodyMarkdown, ...summary } = note;
  return summary;
}

import { decodeNoteDocBytes } from "@cocurdex/note-doc/bytes";
import type { NoteKind, NoteRecord } from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { pullNoteDoc } from "./note-doc-registry";
import {
  applySavedNoteRecord,
  forgetNote,
  hasPendingNoteSave,
  saveNoteTitleAtom,
  toNoteSummary,
  waitForNoteSaves,
} from "./note-save-store";
import {
  activeNoteAtom,
  activeNoteDocAtom,
  activeNoteIdAtom,
  noteSaveStatusAtom,
  noteSummariesAtom,
  notesLoadingAtom,
  notesRevealNonceAtom,
  noteTitleEpochAtom,
} from "./notes-atoms";
import { notesIpc } from "./notes-ipc";

export {
  type ActiveNoteDoc,
  activeNoteAtom,
  activeNoteDocAtom,
  activeNoteIdAtom,
  type NoteSaveStatus,
  noteSaveStatusAtom,
  noteSummariesAtom,
  notesLoadingAtom,
  notesRevealNonceAtom,
  noteTitleEpochAtom,
} from "./notes-atoms";

export const loadNotesAtom = atom(null, async (_get, set) => {
  set(notesLoadingAtom, true);
  try {
    set(noteSummariesAtom, await notesIpc.list());
  } finally {
    set(notesLoadingAtom, false);
  }
});

async function fetchNoteDoc(noteId: string) {
  const snapshot = await notesIpc.getDoc({ id: noteId });
  return snapshot
    ? { noteId, state: decodeNoteDocBytes(snapshot.update) }
    : null;
}

function showNote(
  set: Setter,
  note: NoteRecord | null,
  doc: Awaited<ReturnType<typeof fetchNoteDoc>>,
) {
  set(activeNoteAtom, note);
  set(activeNoteDocAtom, doc);
}

export const openNoteAtom = atom(null, async (get, set, noteId: string) => {
  if (get(activeNoteIdAtom) === noteId) {
    return;
  }

  set(activeNoteIdAtom, noteId);
  set(noteSaveStatusAtom, "idle");
  await waitForNoteSaves(noteId);
  const [note, doc] = await Promise.all([
    notesIpc.get({ id: noteId }),
    fetchNoteDoc(noteId),
  ]);
  if (get(activeNoteIdAtom) === noteId) {
    showNote(set, note, doc);
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
    const doc = note.kind === "note" ? await fetchNoteDoc(note.id) : null;
    set(noteSummariesAtom, [
      ...get(noteSummariesAtom).filter((item) => item.id !== note.id),
      toNoteSummary(note),
    ]);
    set(activeNoteIdAtom, note.id);
    showNote(set, note, doc);
    set(noteSaveStatusAtom, "idle");
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
    set(noteSummariesAtom, await notesIpc.list());
    const current = get(activeNoteAtom);
    if (current?.id === moved.id) {
      set(activeNoteAtom, moved);
    }
    set(notesRevealNonceAtom, get(notesRevealNonceAtom) + 1);
    return moved;
  },
);

function clearActiveNote(set: Setter) {
  set(activeNoteIdAtom, null);
  showNote(set, null, null);
}

export const deleteNoteAtom = atom(null, async (get, set, noteId: string) => {
  await waitForNoteSaves(noteId);
  await notesIpc.delete({ id: noteId });
  forgetNote(noteId);
  const summaries = await notesIpc.list();
  set(noteSummariesAtom, summaries);
  if (!summaries.some((note) => note.id === get(activeNoteIdAtom))) {
    clearActiveNote(set);
  }
});

export const renameNoteAtom = atom(
  null,
  (_get, set, payload: { id: string; title: string }): Promise<NoteRecord> =>
    set(saveNoteTitleAtom, { noteId: payload.id, title: payload.title }),
);

export const applyNoteDocSaveAtom = atom(
  null,
  (get, set, saved: NoteRecord) => {
    const active = get(activeNoteAtom);
    applySavedNoteRecord(get, set, saved);
    const titleChangedElsewhere =
      active?.id === saved.id &&
      active.title !== saved.title &&
      !hasPendingNoteSave(saved.id);
    if (titleChangedElsewhere) {
      set(noteTitleEpochAtom, get(noteTitleEpochAtom) + 1);
    }
  },
);

async function refreshActiveTitle(get: Getter, set: Setter, noteId: string) {
  if (hasPendingNoteSave(noteId)) {
    return;
  }
  const fresh = await notesIpc.get({ id: noteId });
  const current = get(activeNoteAtom);
  if (!fresh || current?.id !== noteId || hasPendingNoteSave(noteId)) {
    return;
  }
  set(activeNoteAtom, fresh);
  if (fresh.title !== current.title) {
    set(noteTitleEpochAtom, get(noteTitleEpochAtom) + 1);
  }
}

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
      clearActiveNote(set);
      return;
    }
    const titleMayHaveChanged =
      get(activeNoteAtom)?.revision !== summary.revision;
    await Promise.all([
      pullNoteDoc(activeId),
      titleMayHaveChanged ? refreshActiveTitle(get, set, activeId) : null,
    ]);
  } catch {
    // External refresh is best-effort; preserve the current editor state.
  }
});

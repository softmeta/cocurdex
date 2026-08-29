import type { NoteKind, NoteRecord, NoteSummary } from "@cocurdex/shared";
import { atom } from "jotai";
import { notesIpc } from "./notes-ipc";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

export const noteSummariesAtom = atom<NoteSummary[]>([]);
export const activeNoteIdAtom = atom<string | null>(null);
export const activeNoteAtom = atom<NoteRecord | null>(null);
export const notesLoadingAtom = atom(false);
export const noteSaveStatusAtom = atom<NoteSaveStatus>("idle");
export const noteEditorDirtyAtom = atom(false);
export const notesRevealNonceAtom = atom(0);
export const noteContentEpochAtom = atom(0);

export const loadNotesAtom = atom(null, async (_get, set) => {
  set(notesLoadingAtom, true);
  try {
    set(noteSummariesAtom, await notesIpc.list());
  } finally {
    set(notesLoadingAtom, false);
  }
});

export const loadNoteSummariesAtom = atom(null, async (_get, set) => {
  set(noteSummariesAtom, await notesIpc.list());
});

export const openNoteAtom = atom(null, async (get, set, noteId: string) => {
  if (get(activeNoteIdAtom) === noteId) {
    return;
  }

  set(activeNoteIdAtom, noteId);
  set(noteSaveStatusAtom, "idle");
  set(noteEditorDirtyAtom, false);
  const note = await notesIpc.get({ id: noteId });
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
    const current = get(activeNoteAtom);
    const moved = await notesIpc.move({
      ...payload,
      expectedRevision:
        current?.id === payload.id ? current.revision : undefined,
    });
    set(noteSummariesAtom, await notesIpc.list());
    if (current?.id === moved.id) {
      set(activeNoteAtom, moved);
    }
    set(notesRevealNonceAtom, get(notesRevealNonceAtom) + 1);
    return moved;
  },
);

export const deleteNoteAtom = atom(null, async (get, set, noteId: string) => {
  const active = get(activeNoteAtom);
  await notesIpc.delete({
    id: noteId,
    expectedRevision: active?.id === noteId ? active.revision : undefined,
  });
  const summaries = await notesIpc.list();
  set(noteSummariesAtom, summaries);
  if (!summaries.some((note) => note.id === get(activeNoteIdAtom))) {
    set(activeNoteIdAtom, null);
    set(activeNoteAtom, null);
  }
});

export const renameNoteSummaryAtom = atom(
  null,
  (get, set, payload: { id: string; title: string }) => {
    set(
      noteSummariesAtom,
      get(noteSummariesAtom).map((note) =>
        note.id === payload.id ? { ...note, title: payload.title } : note,
      ),
    );
    const active = get(activeNoteAtom);
    if (active?.id === payload.id) {
      set(activeNoteAtom, { ...active, title: payload.title });
    }
  },
);

export const renameNoteAtom = atom(
  null,
  async (
    get,
    set,
    payload: { id: string; title: string },
  ): Promise<NoteRecord> => {
    const current = get(activeNoteAtom);
    const renamed = await notesIpc.rename({
      ...payload,
      expectedRevision:
        current?.id === payload.id ? current.revision : undefined,
    });
    set(
      noteSummariesAtom,
      get(noteSummariesAtom).map((note) =>
        note.id === renamed.id ? toSummary(renamed) : note,
      ),
    );
    if (current?.id === renamed.id) {
      set(activeNoteAtom, renamed);
    }
    return renamed;
  },
);

export const patchActiveNoteRevisionAtom = atom(
  null,
  (get, set, revision: number) => {
    const active = get(activeNoteAtom);
    if (active) {
      set(activeNoteAtom, { ...active, revision });
    }
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
      set(activeNoteIdAtom, null);
      set(activeNoteAtom, null);
      set(noteEditorDirtyAtom, false);
      return;
    }

    const current = get(activeNoteAtom);
    if (current?.revision === summary.revision) {
      return;
    }
    if (get(noteEditorDirtyAtom) || get(noteSaveStatusAtom) === "saving") {
      return;
    }

    const fresh = await notesIpc.get({ id: activeId });
    if (get(activeNoteIdAtom) === activeId && fresh) {
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

import { atom } from "jotai";
import { notesIpc } from "./notes-ipc";
import {
  activeNoteAtom,
  createNoteAtom,
  loadNotesAtom,
  noteContentEpochAtom,
  noteEditorDirtyAtom,
  noteSaveStatusAtom,
  patchActiveNoteRevisionAtom,
} from "./notes-store";

// Registered by the mounted TipTap note body so other features (e.g. PDF
// selection → note) can append Markdown without going through IPC and racing
// the open editor's dirty buffer.
//
// IMPORTANT: never `set(atom, handlerFn)` — Jotai treats a function value as an
// updater. Always `set(atom, () => handlerFn)` (or set null).
export type NoteBodyInsertHandler = (markdown: string) => boolean;

export const noteBodyInsertHandlerAtom = atom<NoteBodyInsertHandler | null>(
  null,
);

interface PendingNoteBodyInsert {
  markdown: string;
  resolve: (ok: boolean) => void;
}

// When the note body is not mounted yet, stash markdown here; TipTap onCreate
// flushes it once the insert handler is registered (user opens Notes later).
export const pendingNoteBodyInsertAtom = atom<PendingNoteBodyInsert | null>(
  null,
);

export function flushPendingNoteBodyInsert(
  handler: NoteBodyInsertHandler,
  getPending: () => PendingNoteBodyInsert | null,
  clearPending: () => void,
): boolean {
  const pending = getPending();
  if (!pending) {
    return false;
  }
  const ok = handler(pending.markdown);
  clearPending();
  pending.resolve(ok);
  return true;
}

function appendMarkdownBodies(existing: string, clip: string): string {
  const base = existing.replace(/\s+$/u, "");
  const next = clip.trim();
  if (next.length === 0) {
    return base;
  }
  if (base.length === 0) {
    return next;
  }
  return `${base}\n\n${next}`;
}

export type InsertMarkdownIntoNoteResult =
  | "inserted"
  | "created"
  | "failed"
  | "no-root";

// Insert Markdown into the active file note. If none is open, create one.
// Does not switch the right-panel tab — the user stays on PDF (or wherever).
export const insertMarkdownIntoActiveNoteAtom = atom(
  null,
  async (
    get,
    set,
    payload: { markdown: string; createTitle?: string },
  ): Promise<InsertMarkdownIntoNoteResult> => {
    const markdown = payload.markdown.trim();
    if (!markdown) {
      return "failed";
    }

    // Prefer the live TipTap body when Notes has been opened (keep-alive).
    const handler = get(noteBodyInsertHandlerAtom);
    const activeNote = get(activeNoteAtom);
    if (handler && activeNote && activeNote.kind !== "folder") {
      if (handler(markdown)) {
        return "inserted";
      }
    }

    // Cold start: NotesView may never have mounted.
    if (get(activeNoteAtom) === null) {
      await set(loadNotesAtom);
    }

    let created = false;
    let note = get(activeNoteAtom);
    if (!note || note.kind === "folder") {
      const createdNote = await set(createNoteAtom, {
        parentId: null,
        title: payload.createTitle,
      });
      if (!createdNote) {
        return "no-root";
      }
      note = createdNote;
      created = true;
    }

    // TipTap may have mounted for this note after createNote in the same tick
    // only if Notes is already keep-alive — try handler once more.
    const liveHandler = get(noteBodyInsertHandlerAtom);
    if (liveHandler) {
      if (liveHandler(markdown)) {
        return created ? "created" : "inserted";
      }
    }

    // Notes editor not mounted: persist via IPC and keep the in-memory record
    // current so opening Notes later shows the clip without a tab switch now.
    try {
      const nextBody = appendMarkdownBodies(note.bodyMarkdown, markdown);
      const updated = await notesIpc.update({
        id: note.id,
        bodyMarkdown: nextBody,
        expectedRevision: note.revision,
      });
      set(activeNoteAtom, updated);
      set(patchActiveNoteRevisionAtom, updated.revision);
      set(noteEditorDirtyAtom, false);
      set(noteSaveStatusAtom, "saved");
      // If Notes is keep-alive but the insert handler was missing, remount the
      // body from the updated record without forcing a tab change.
      if (get(noteBodyInsertHandlerAtom) === null) {
        set(noteContentEpochAtom, get(noteContentEpochAtom) + 1);
      }
      return created ? "created" : "inserted";
    } catch {
      return "failed";
    }
  },
);

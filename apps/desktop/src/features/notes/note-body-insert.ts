import {
  decodeNoteDocBytes,
  encodeNoteDocBytes,
} from "@cocurdex/note-doc/bytes";
import { atom } from "jotai";
import { applySavedNoteRecord, waitForNoteSaves } from "./note-save-store";
import { notesIpc } from "./notes-ipc";
import { activeNoteAtom, createNoteAtom, loadNotesAtom } from "./notes-store";

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

async function appendMarkdownThroughDaemon(noteId: string, clip: string) {
  await waitForNoteSaves(noteId);
  const snapshot = await notesIpc.getDoc({ id: noteId });
  if (!snapshot) {
    return null;
  }
  const {
    applyMarkdownToNoteDoc,
    diffNoteDoc,
    noteDocStateVector,
    noteDocToMarkdown,
  } = await import("@cocurdex/note-doc");
  const state = decodeNoteDocBytes(snapshot.update);
  const next = applyMarkdownToNoteDoc(
    state,
    appendMarkdownBodies(noteDocToMarkdown(state), clip),
  );
  return notesIpc.applyDocUpdate({
    id: noteId,
    update: encodeNoteDocBytes(
      diffNoteDoc(next.state, noteDocStateVector(state)),
    ),
  });
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

    try {
      const saved = await appendMarkdownThroughDaemon(note.id, markdown);
      if (!saved) {
        return "failed";
      }
      applySavedNoteRecord(get, set, saved);
    } catch {
      return "failed";
    }
    return created ? "created" : "inserted";
  },
);

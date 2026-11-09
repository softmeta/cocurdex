import {
  decodeNoteDocBytes,
  encodeNoteDocBytes,
} from "@cocurdex/note-doc/bytes";
import { atom } from "jotai";
import { applySavedNoteRecord, waitForNoteSaves } from "./note-save-store";
import { notesApi } from "./notes-api";
import { activeNoteAtom, createNoteAtom, loadNotesAtom } from "./notes-store";

export type NoteBodyInsertHandler = (markdown: string) => boolean;

export const noteBodyInsertHandlerAtom = atom<NoteBodyInsertHandler | null>(
  null,
);

interface PendingNoteBodyInsert {
  markdown: string;
  resolve: (ok: boolean) => void;
}

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
  const snapshot = await notesApi.getDoc({ id: noteId });
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
  return notesApi.applyDocUpdate({
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

    const handler = get(noteBodyInsertHandlerAtom);
    const activeNote = get(activeNoteAtom);
    if (handler && activeNote && activeNote.kind !== "folder") {
      if (handler(markdown)) {
        return "inserted";
      }
    }

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

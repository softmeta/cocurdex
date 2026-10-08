import type { NoteRecord, NoteSummary } from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { flushNoteDoc } from "./note-doc-registry";
import {
  activeNoteAtom,
  noteSaveStatusAtom,
  noteSummariesAtom,
} from "./notes-atoms";
import { notesIpc } from "./notes-ipc";

interface TitleSaveState {
  queued: string | null;
  running: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  saved: NoteRecord | null;
}

const SAVE_RETRY_DELAY_MS = 3000;
const titleStates = new Map<string, TitleSaveState>();

function titleStateFor(noteId: string): TitleSaveState {
  let state = titleStates.get(noteId);
  if (!state) {
    state = { queued: null, running: null, retryTimer: null, saved: null };
    titleStates.set(noteId, state);
  }
  return state;
}

export function toNoteSummary(note: NoteRecord): NoteSummary {
  const { bodyMarkdown: _bodyMarkdown, ...summary } = note;
  return summary;
}

export function applySavedNoteRecord(
  get: Getter,
  set: Setter,
  saved: NoteRecord,
) {
  if (get(activeNoteAtom)?.id === saved.id) {
    set(activeNoteAtom, saved);
  }
  set(
    noteSummariesAtom,
    get(noteSummariesAtom).map((note) =>
      note.id === saved.id ? toNoteSummary(saved) : note,
    ),
  );
}

export function hasPendingNoteSave(noteId: string): boolean {
  const state = titleStates.get(noteId);
  return Boolean(state && (state.running || state.queued !== null));
}

export function forgetNote(noteId: string): void {
  const state = titleStates.get(noteId);
  if (state?.retryTimer) {
    clearTimeout(state.retryTimer);
  }
  titleStates.delete(noteId);
}

export async function waitForNoteSaves(noteId: string): Promise<void> {
  const state = titleStates.get(noteId);
  while (state?.running) {
    await state.running;
  }
  await flushNoteDoc(noteId);
}

export function resetNoteSaveStateForTests(): void {
  for (const noteId of [...titleStates.keys()]) {
    forgetNote(noteId);
  }
}

function setActiveStatus(
  get: Getter,
  set: Setter,
  noteId: string,
  status: "saving" | "saved" | "error",
) {
  if (get(activeNoteAtom)?.id === noteId) {
    set(noteSaveStatusAtom, status);
  }
}

async function runTitleQueue(get: Getter, set: Setter, noteId: string) {
  const state = titleStateFor(noteId);
  while (state.queued !== null) {
    const title = state.queued;
    state.queued = null;
    setActiveStatus(get, set, noteId, "saving");
    try {
      const saved = await notesIpc.update({ id: noteId, title });
      state.saved = saved;
      applySavedNoteRecord(get, set, saved);
    } catch {
      state.queued ??= title;
      setActiveStatus(get, set, noteId, "error");
      state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        drainTitleQueue(get, set, noteId);
      }, SAVE_RETRY_DELAY_MS);
      return;
    }
  }
  setActiveStatus(get, set, noteId, "saved");
}

function drainTitleQueue(get: Getter, set: Setter, noteId: string) {
  const state = titleStateFor(noteId);
  if (state.running) {
    return;
  }
  state.running = runTitleQueue(get, set, noteId).finally(() => {
    state.running = null;
  });
}

export const saveNoteTitleAtom = atom(
  null,
  async (
    get,
    set,
    payload: { noteId: string; title: string },
  ): Promise<NoteRecord> => {
    const state = titleStateFor(payload.noteId);
    state.queued = payload.title;
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    drainTitleQueue(get, set, payload.noteId);
    while (state.running) {
      await state.running;
    }
    if (state.queued !== null || !state.saved) {
      throw new Error(`Note rename was not saved: ${payload.noteId}`);
    }
    return state.saved;
  },
);

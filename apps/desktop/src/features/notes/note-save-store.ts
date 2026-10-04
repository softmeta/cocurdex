import {
  isNoteConflictError,
  type NoteRecord,
  type NoteSummary,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import {
  activeNoteAtom,
  noteContentEpochAtom,
  noteEditorDirtyAtom,
  noteSaveConflictsAtom,
  noteSaveStatusAtom,
  noteSummariesAtom,
} from "./notes-atoms";
import { notesIpc } from "./notes-ipc";

export interface NoteChange {
  bodyMarkdown?: string;
  title?: string;
}

interface NoteSyncState {
  known: NoteRecord | null;
  queued: NoteChange;
  conflict: NoteRecord | null;
  running: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const SAVE_RETRY_DELAY_MS = 3000;
const syncStates = new Map<string, NoteSyncState>();

function syncStateFor(noteId: string): NoteSyncState {
  let state = syncStates.get(noteId);
  if (!state) {
    state = {
      known: null,
      queued: {},
      conflict: null,
      running: null,
      retryTimer: null,
    };
    syncStates.set(noteId, state);
  }
  return state;
}

function hasQueuedChange(state: NoteSyncState): boolean {
  return (
    state.queued.bodyMarkdown !== undefined || state.queued.title !== undefined
  );
}

export function hasPendingNoteSave(noteId: string): boolean {
  const state = syncStates.get(noteId);
  return Boolean(
    state && (state.running || hasQueuedChange(state) || state.conflict),
  );
}

export function rememberNoteRecord(note: NoteRecord): void {
  const state = syncStateFor(note.id);
  if (!state.running && !hasQueuedChange(state)) {
    state.known = note;
  }
}

export function forgetNote(noteId: string): void {
  const state = syncStates.get(noteId);
  if (state?.retryTimer) {
    clearTimeout(state.retryTimer);
  }
  syncStates.delete(noteId);
}

export async function waitForNoteSaves(noteId: string): Promise<void> {
  const state = syncStates.get(noteId);
  while (state?.running) {
    await state.running;
  }
}

export function resetNoteSaveStateForTests(): void {
  for (const noteId of [...syncStates.keys()]) {
    forgetNote(noteId);
  }
}

function toSummary(note: NoteRecord): NoteSummary {
  const { bodyMarkdown: _bodyMarkdown, ...summary } = note;
  return summary;
}

function applySavedRecord(get: Getter, set: Setter, saved: NoteRecord) {
  const active = get(activeNoteAtom);
  if (active?.id === saved.id) {
    set(activeNoteAtom, saved);
  }
  set(
    noteSummariesAtom,
    get(noteSummariesAtom).map((note) =>
      note.id === saved.id ? toSummary(saved) : note,
    ),
  );
}

function setActiveStatus(
  get: Getter,
  set: Setter,
  noteId: string,
  status: "saving" | "saved" | "error" | "conflict",
) {
  if (get(activeNoteAtom)?.id !== noteId) {
    return;
  }
  set(noteSaveStatusAtom, status);
  if (status === "saved") {
    set(noteEditorDirtyAtom, false);
  }
}

function isUnchangedRemotely(
  change: NoteChange,
  known: NoteRecord | null,
  latest: NoteRecord,
): boolean {
  if (!known) {
    return false;
  }
  const bodyClean =
    change.bodyMarkdown === undefined ||
    latest.bodyMarkdown === known.bodyMarkdown;
  const titleClean = change.title === undefined || latest.title === known.title;
  return bodyClean && titleClean;
}

async function sendChange(
  noteId: string,
  change: NoteChange,
  state: NoteSyncState,
): Promise<NoteRecord | "conflict"> {
  const payload = { id: noteId, ...change };
  try {
    return await notesIpc.update({
      ...payload,
      expectedRevision: state.known?.revision,
    });
  } catch (error) {
    if (!isNoteConflictError(error)) {
      throw error;
    }
  }
  const latest = await notesIpc.get({ id: noteId });
  if (!latest) {
    throw new Error(`Note not found: ${noteId}`);
  }
  if (!isUnchangedRemotely(change, state.known, latest)) {
    state.conflict = latest;
    return "conflict";
  }
  return notesIpc.update({ ...payload, expectedRevision: latest.revision });
}

function latestConflict(state: NoteSyncState): NoteRecord {
  if (!state.conflict) {
    throw new Error("Note conflict is missing");
  }
  return state.conflict;
}

function clearConflict(get: Getter, set: Setter, noteId: string) {
  const { [noteId]: _resolved, ...rest } = get(noteSaveConflictsAtom);
  set(noteSaveConflictsAtom, rest);
}

function scheduleRetry(get: Getter, set: Setter, noteId: string) {
  const state = syncStateFor(noteId);
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
  }
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    drainQueue(get, set, noteId);
  }, SAVE_RETRY_DELAY_MS);
}

async function runQueue(get: Getter, set: Setter, noteId: string) {
  const state = syncStateFor(noteId);
  while (hasQueuedChange(state) && !state.conflict) {
    const change = state.queued;
    state.queued = {};
    setActiveStatus(get, set, noteId, "saving");
    try {
      const result = await sendChange(noteId, change, state);
      if (result === "conflict") {
        state.queued = { ...change, ...state.queued };
        set(noteSaveConflictsAtom, {
          ...get(noteSaveConflictsAtom),
          [noteId]: latestConflict(state),
        });
        setActiveStatus(get, set, noteId, "conflict");
        return;
      }
      state.known = result;
      applySavedRecord(get, set, result);
    } catch {
      state.queued = { ...change, ...state.queued };
      setActiveStatus(get, set, noteId, "error");
      scheduleRetry(get, set, noteId);
      return;
    }
  }
  if (!state.conflict) {
    setActiveStatus(get, set, noteId, "saved");
  }
}

function drainQueue(get: Getter, set: Setter, noteId: string) {
  const state = syncStateFor(noteId);
  if (state.running) {
    return;
  }
  state.running = runQueue(get, set, noteId).finally(() => {
    state.running = null;
  });
}

export const saveNoteChangeAtom = atom(
  null,
  (get, set, payload: { noteId: string; change: NoteChange }) => {
    const state = syncStateFor(payload.noteId);
    state.queued = { ...state.queued, ...payload.change };
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    drainQueue(get, set, payload.noteId);
    return state.running ?? Promise.resolve();
  },
);

export function getKnownNote(noteId: string): NoteRecord | null {
  return syncStates.get(noteId)?.known ?? null;
}

export function getLocalNote(noteId: string): NoteRecord | null {
  const state = syncStates.get(noteId);
  if (!state?.known) {
    return null;
  }
  return { ...state.known, ...state.queued };
}

export function hasUnsavedNoteChange(noteId: string): boolean {
  const state = syncStates.get(noteId);
  return Boolean(state && (hasQueuedChange(state) || state.conflict));
}

export const resolveNoteConflictAtom = atom(
  null,
  async (
    get,
    set,
    payload: { noteId: string; choice: "keep-mine" | "use-remote" },
  ) => {
    const { noteId, choice } = payload;
    const state = syncStateFor(noteId);
    const remote = state.conflict;
    if (!remote) {
      return;
    }
    state.conflict = null;
    state.known = remote;
    clearConflict(get, set, noteId);
    if (choice === "use-remote") {
      state.queued = {};
      applySavedRecord(get, set, remote);
      set(noteContentEpochAtom, get(noteContentEpochAtom) + 1);
      setActiveStatus(get, set, noteId, "saved");
      return;
    }
    drainQueue(get, set, noteId);
    await waitForNoteSaves(noteId);
  },
);

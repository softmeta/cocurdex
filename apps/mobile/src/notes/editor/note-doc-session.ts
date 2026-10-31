import type { NoteDocSnapshot, NoteRecord } from "@cocurdex/shared";
import * as Y from "yjs";
import { decodeNoteDocBytes, encodeNoteDocBytes } from "./note-doc-bytes";

const REMOTE_ORIGIN = Symbol("note-doc-remote");
const LOCAL_ORIGIN = Symbol("note-doc-local");
const NOTE_DOC_FIELD = "default";

function hasText(fragment: Y.XmlFragment) {
  for (const node of fragment.createTreeWalker(
    (entry) => entry instanceof Y.XmlText,
  )) {
    const runs: { insert?: unknown }[] = (node as Y.XmlText).toDelta();
    if (runs.some((run) => typeof run.insert === "string" && run.insert.trim()))
      return true;
  }
  return false;
}

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

export interface NoteDocApi {
  getDoc(stateVector?: string): Promise<NoteDocSnapshot | null>;
  applyDocUpdate(update: string): Promise<NoteRecord>;
  updateTitle(title: string): Promise<NoteRecord>;
}

export interface NoteDocSessionSnapshot {
  loaded: boolean;
  missing: boolean;
  status: NoteSaveStatus;
}

export interface NoteDocSessionTiming {
  sendDelayMs: number;
  retryDelayMs: number;
}

const DEFAULT_TIMING: NoteDocSessionTiming = {
  sendDelayMs: 300,
  retryDelayMs: 3000,
};

export function createNoteDocSession(
  api: NoteDocApi,
  onSaved: (note: NoteRecord) => void,
  timing: NoteDocSessionTiming = DEFAULT_TIMING,
) {
  const doc = new Y.Doc();
  const listeners = new Set<() => void>();
  const remoteListeners = new Set<(update: string) => void>();
  let snapshot: NoteDocSessionSnapshot = {
    loaded: false,
    missing: false,
    status: "idle",
  };
  let pendingUpdates: Uint8Array[] = [];
  let pendingTitle: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending: Promise<void> | null = null;
  let attached = true;

  const publish = (next: Partial<NoteDocSessionSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  const hasPending = () => pendingUpdates.length > 0 || pendingTitle !== null;

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void send();
    }, delay);
  };

  const sendOnce = async () => {
    const updates = pendingUpdates;
    const title = pendingTitle;
    pendingUpdates = [];
    pendingTitle = null;
    try {
      if (updates.length > 0) {
        const merged = Y.mergeUpdates(updates);
        onSaved(await api.applyDocUpdate(encodeNoteDocBytes(merged)));
      }
      if (title !== null) onSaved(await api.updateTitle(title));
      if (!hasPending()) publish({ status: "saved" });
    } catch {
      pendingUpdates = [...updates, ...pendingUpdates];
      pendingTitle ??= title;
      publish({ status: "error" });
      if (attached) schedule(timing.retryDelayMs);
    }
  };

  const send = async (): Promise<void> => {
    while (sending) await sending;
    if (!hasPending()) return;
    sending = sendOnce().finally(() => {
      sending = null;
    });
    await sending;
  };

  const queue = () => {
    publish({ status: "saving" });
    schedule(timing.sendDelayMs);
  };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) {
      const encoded = encodeNoteDocBytes(update);
      for (const listener of remoteListeners) listener(encoded);
      return;
    }
    pendingUpdates = [...pendingUpdates, update];
    queue();
  });

  const applyRemote = (snapshotDoc: NoteDocSnapshot | null) => {
    if (!snapshotDoc) return false;
    Y.applyUpdate(doc, decodeNoteDocBytes(snapshotDoc.update), REMOTE_ORIGIN);
    return true;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => snapshot,
    async load() {
      try {
        const found = applyRemote(await api.getDoc());
        publish({ loaded: found, missing: !found });
      } catch {
        publish({ status: "error" });
      }
    },
    async pull() {
      const stateVector = encodeNoteDocBytes(Y.encodeStateVector(doc));
      applyRemote(await api.getDoc(stateVector));
    },
    state: () => encodeNoteDocBytes(Y.encodeStateAsUpdate(doc)),
    applyLocal(update: string) {
      Y.applyUpdate(doc, decodeNoteDocBytes(update), LOCAL_ORIGIN);
    },
    setTitle(title: string) {
      pendingTitle = title;
      queue();
    },
    onRemoteUpdate(listener: (update: string) => void) {
      remoteListeners.add(listener);
      return () => {
        remoteListeners.delete(listener);
      };
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await send();
    },
    detach() {
      attached = false;
    },
    isBlank: () => !hasText(doc.getXmlFragment(NOTE_DOC_FIELD)),
  };
}

export type NoteDocSession = ReturnType<typeof createNoteDocSession>;

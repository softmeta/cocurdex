import {
  decodeNoteDocBytes,
  encodeNoteDocBytes,
} from "@cocurdex/note-doc/bytes";
import type { NoteRecord } from "@cocurdex/shared";
import * as Y from "yjs";
import { registerNoteDocSession } from "./note-doc-registry";
import { notesIpc } from "./notes-ipc";

const REMOTE_ORIGIN = Symbol("note-doc-remote");
const SEND_DELAY_MS = 300;
const RETRY_DELAY_MS = 3000;

export type NoteDocSyncStatus = "saving" | "saved" | "error";

export interface NoteDocSessionCallbacks {
  onStatus: (status: NoteDocSyncStatus) => void;
  onSaved: (note: NoteRecord) => void;
}

export function createNoteDoc(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state, REMOTE_ORIGIN);
  return doc;
}

export function attachNoteDocSession(
  noteId: string,
  doc: Y.Doc,
  callbacks: NoteDocSessionCallbacks,
): () => void {
  let pending: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending: Promise<void> | null = null;
  let attached = true;

  const schedule = (delay: number) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void send();
    }, delay);
  };

  const send = async (): Promise<void> => {
    while (sending) {
      await sending;
    }
    if (pending.length === 0) {
      return;
    }
    const update = Y.mergeUpdates(pending);
    pending = [];
    sending = notesIpc
      .applyDocUpdate({ id: noteId, update: encodeNoteDocBytes(update) })
      .then((note) => {
        callbacks.onSaved(note);
        if (pending.length === 0) {
          callbacks.onStatus("saved");
        }
      })
      .catch(() => {
        pending = [update, ...pending];
        callbacks.onStatus("error");
        if (attached) {
          schedule(RETRY_DELAY_MS);
        }
      })
      .finally(() => {
        sending = null;
      });
    await sending;
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await send();
  };

  const pull = async () => {
    const snapshot = await notesIpc.getDoc({
      id: noteId,
      stateVector: encodeNoteDocBytes(Y.encodeStateVector(doc)),
    });
    if (snapshot) {
      Y.applyUpdate(doc, decodeNoteDocBytes(snapshot.update), REMOTE_ORIGIN);
    }
  };

  const handleUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) {
      return;
    }
    pending = [...pending, update];
    callbacks.onStatus("saving");
    schedule(SEND_DELAY_MS);
  };

  doc.on("update", handleUpdate);
  const unregister = registerNoteDocSession(noteId, { pull, flush });
  void pull().catch(() => undefined);

  return () => {
    attached = false;
    doc.off("update", handleUpdate);
    unregister();
  };
}

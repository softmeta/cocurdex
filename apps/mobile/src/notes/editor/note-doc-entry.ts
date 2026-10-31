import type { HostConnection } from "@cocurdex/client-runtime";
import type { NoteRecord } from "@cocurdex/shared";
import { createNoteDocSession, type NoteDocSession } from "./note-doc-session";

export type NoteDocConnection = Pick<
  HostConnection,
  "request" | "onEvent" | "subscribeState"
>;

export interface NoteDocCache {
  saved(note: NoteRecord): void;
  listChanged(): void;
}

export interface NoteDocEntry {
  session: NoteDocSession;
  subscribe(listener: () => void): () => void;
  setTitle(title: string): void;
  discardWhenBlank(): void;
}

export function createNoteDocEntry(
  connection: NoteDocConnection,
  noteId: string,
  cache: NoteDocCache,
  onReleased: (entry: NoteDocEntry) => void,
): NoteDocEntry {
  let savedTitle: string | null = null;
  const session = createNoteDocSession(
    {
      getDoc: (stateVector) =>
        connection.request(
          "note.getDoc",
          stateVector ? { id: noteId, stateVector } : { id: noteId },
        ),
      applyDocUpdate: (update) =>
        connection.request("note.applyDocUpdate", { id: noteId, update }),
      updateTitle: (title) =>
        connection.request("note.update", { id: noteId, title }),
    },
    (note) => {
      cache.saved(note);
      if (note.title === savedTitle) return;
      savedTitle = note.title;
      cache.listChanged();
    },
  );
  let subscribers = 0;
  let stop: (() => void) | null = null;
  let title = "";
  let disposable = false;

  const discardIfBlank = async () => {
    if (!disposable || title.trim() !== "" || !session.isBlank()) return;
    await connection.request("note.delete", { id: noteId });
    cache.listChanged();
  };

  const start = () => {
    void session.load();
    const stopEvents = connection.onEvent((event) => {
      if (event.type === "data.changed" && event.areas.includes("notes")) {
        void session.pull().catch(() => undefined);
      }
    });
    const stopState = connection.subscribeState((state) => {
      if (state.status === "live") void session.pull().catch(() => undefined);
    });
    stop = () => {
      stopEvents();
      stopState();
    };
  };

  const finish = () => {
    stop?.();
    stop = null;
    session.detach();
    void session
      .flush()
      .then(() => (subscribers === 0 ? discardIfBlank() : undefined))
      .catch(() => undefined)
      .finally(() => {
        if (subscribers === 0) onReleased(entry);
      });
  };

  const entry: NoteDocEntry = {
    session,
    subscribe(listener) {
      const unsubscribe = session.subscribe(listener);
      subscribers += 1;
      if (subscribers === 1 && !stop) start();
      return () => {
        unsubscribe();
        subscribers -= 1;
        if (subscribers === 0) finish();
      };
    },
    setTitle(next) {
      title = next;
      session.setTitle(next);
    },
    discardWhenBlank() {
      disposable = true;
    },
  };
  return entry;
}

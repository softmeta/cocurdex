import { useSyncExternalStore } from "react";
import { mutate } from "swr";
import { hostConnection } from "@/connection";
import { createNoteDocEntry, type NoteDocEntry } from "./note-doc-entry";

const entries = new Map<string, NoteDocEntry>();

function entryFor(hostId: string, noteId: string) {
  const key = `${hostId}:${noteId}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = createNoteDocEntry(
      hostConnection(hostId),
      noteId,
      {
        saved: (note) =>
          void mutate(["note.get", hostId, note.id], note, {
            revalidate: false,
          }),
        listChanged: () => void mutate(["note.list", hostId]),
      },
      (released) => {
        if (entries.get(key) === released) entries.delete(key);
      },
    );
    entries.set(key, entry);
  }
  return entry;
}

export function discardNoteWhenBlank(hostId: string, noteId: string) {
  entryFor(hostId, noteId).discardWhenBlank();
}

export function useNoteDocSession(hostId: string, noteId: string) {
  const entry = entryFor(hostId, noteId);
  const snapshot = useSyncExternalStore(
    entry.subscribe,
    entry.session.snapshot,
  );
  return { session: entry.session, setTitle: entry.setTitle, ...snapshot };
}

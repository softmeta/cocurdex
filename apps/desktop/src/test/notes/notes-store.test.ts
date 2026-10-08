import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteServer, noteRecord } from "./note-server-mock";

const server = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/features/notes/notes-ipc", () => ({
  get notesIpc() {
    return (server.current as ReturnType<typeof createNoteServer>).ipc;
  },
}));

import {
  activeNoteAtom,
  activeNoteDocAtom,
  createNoteAtom,
  loadNotesAtom,
  noteSummariesAtom,
  openNoteAtom,
  refreshNotesAtom,
} from "@/features/notes/notes-store";

let notes: ReturnType<typeof createNoteServer>;

beforeEach(() => {
  notes = createNoteServer();
  server.current = notes;
});

describe("SQLite-backed notes store", () => {
  it("loads summaries without a filesystem root", async () => {
    notes.seed(noteRecord("a"));
    notes.seed(noteRecord("b"));
    const store = createStore();

    await store.set(loadNotesAtom);

    expect(store.get(noteSummariesAtom).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("opens a note together with its collaborative doc", async () => {
    notes.seed(noteRecord("a", { bodyMarkdown: "Hello" }));
    const store = createStore();

    await store.set(openNoteAtom, "a");

    expect(store.get(activeNoteAtom)?.id).toBe("a");
    expect(store.get(activeNoteDocAtom)?.noteId).toBe("a");
  });

  it("creates a note and opens its doc", async () => {
    const store = createStore();

    const created = await store.set(createNoteAtom, null);

    expect(store.get(activeNoteAtom)?.id).toBe(created?.id);
    expect(store.get(activeNoteDocAtom)?.noteId).toBe(created?.id);
  });

  it("lists a created note once when a refresh lands during creation", async () => {
    const store = createStore();
    const getDoc = notes.ipc.getDoc.getMockImplementation();
    notes.ipc.getDoc.mockImplementationOnce(async (payload) => {
      await store.set(refreshNotesAtom);
      return getDoc ? getDoc(payload) : null;
    });

    const created = await store.set(createNoteAtom, null);

    expect(
      store.get(noteSummariesAtom).filter((note) => note.id === created?.id),
    ).toHaveLength(1);
  });
});

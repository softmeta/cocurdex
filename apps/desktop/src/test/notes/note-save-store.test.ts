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
  resetNoteSaveStateForTests,
  saveNoteTitleAtom,
} from "@/features/notes/note-save-store";
import {
  activeNoteAtom,
  noteSaveStatusAtom,
  openNoteAtom,
  renameNoteAtom,
} from "@/features/notes/notes-store";

let notes: ReturnType<typeof createNoteServer>;

beforeEach(() => {
  vi.useRealTimers();
  notes = createNoteServer();
  server.current = notes;
  resetNoteSaveStateForTests();
});

async function openSeeded(store: ReturnType<typeof createStore>, id: string) {
  notes.seed(noteRecord(id, { bodyMarkdown: "start" }));
  await store.set(openNoteAtom, id);
}

describe("note title queue", () => {
  it("saves the latest title typed during an in-flight rename", async () => {
    const store = createStore();
    await openSeeded(store, "a");

    const first = store.set(saveNoteTitleAtom, { noteId: "a", title: "One" });
    const second = store.set(saveNoteTitleAtom, { noteId: "a", title: "Two" });
    await Promise.all([first, second]);

    expect(notes.notes.get("a")?.title).toBe("Two");
    expect(store.get(activeNoteAtom)?.title).toBe("Two");
    expect(store.get(noteSaveStatusAtom)).toBe("saved");
  });

  it("renames over a concurrent body edit without a conflict", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.editBodyExternally("a", "agent text");

    const saved = await store.set(renameNoteAtom, { id: "a", title: "Plan" });

    expect(saved).toMatchObject({ title: "Plan", bodyMarkdown: "agent text" });
  });

  it("does not stamp a finished rename onto the next active note", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.seed(noteRecord("b", { revision: 7 }));

    const saving = store.set(saveNoteTitleAtom, { noteId: "a", title: "A" });
    await store.set(openNoteAtom, "b");
    await saving;

    expect(store.get(activeNoteAtom)).toMatchObject({ id: "b", revision: 7 });
  });

  it("retries a rename that failed for a transient reason", async () => {
    vi.useFakeTimers();
    const store = createStore();
    await openSeeded(store, "a");
    notes.ipc.update.mockRejectedValueOnce(new Error("daemon unavailable"));

    await expect(
      store.set(saveNoteTitleAtom, { noteId: "a", title: "Kept" }),
    ).rejects.toThrow("not saved");
    expect(store.get(noteSaveStatusAtom)).toBe("error");

    await vi.advanceTimersByTimeAsync(3000);
    expect(notes.notes.get("a")?.title).toBe("Kept");
    expect(store.get(noteSaveStatusAtom)).toBe("saved");
  });
});

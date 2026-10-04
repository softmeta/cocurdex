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
  resolveNoteConflictAtom,
  saveNoteChangeAtom,
} from "@/features/notes/note-save-store";
import {
  activeNoteAtom,
  noteSaveConflictsAtom,
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

describe("note save queue", () => {
  it("sends edits made during an in-flight save with the new revision", async () => {
    const store = createStore();
    await openSeeded(store, "a");

    const first = store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "one" },
    });
    void store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "two" },
    });
    await first;

    expect(notes.notes.get("a")).toMatchObject({
      bodyMarkdown: "two",
      revision: 3,
    });
    expect(store.get(noteSaveStatusAtom)).toBe("saved");
  });

  it("orders a title rename and a body save without a conflict", async () => {
    const store = createStore();
    await openSeeded(store, "a");

    const renamed = store.set(renameNoteAtom, { id: "a", title: "Plan" });
    const saved = store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "body" },
    });
    await Promise.all([renamed, saved]);

    expect(notes.notes.get("a")).toMatchObject({
      title: "Plan",
      bodyMarkdown: "body",
    });
    expect(store.get(noteSaveConflictsAtom)).toEqual({});
  });

  it("does not stamp a finished save onto the next active note", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.seed(noteRecord("b", { revision: 7 }));

    const saving = store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "edited" },
    });
    await store.set(openNoteAtom, "b");
    await saving;

    expect(store.get(activeNoteAtom)).toMatchObject({ id: "b", revision: 7 });
  });

  it("retries automatically when only the title changed elsewhere", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.editExternally("a", { title: "Renamed by agent" });

    await store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "mine" },
    });

    expect(notes.notes.get("a")).toMatchObject({
      title: "Renamed by agent",
      bodyMarkdown: "mine",
    });
  });

  it("surfaces a body conflict and keeps later edits until resolved", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.editExternally("a", { bodyMarkdown: "agent text" });

    await store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "mine" },
    });
    expect(store.get(noteSaveStatusAtom)).toBe("conflict");
    expect(store.get(noteSaveConflictsAtom).a?.bodyMarkdown).toBe("agent text");

    await store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "mine, continued" },
    });
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("agent text");

    await store.set(resolveNoteConflictAtom, {
      noteId: "a",
      choice: "keep-mine",
    });
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("mine, continued");
    expect(store.get(noteSaveConflictsAtom)).toEqual({});
  });

  it("loads the remote version when the user discards local edits", async () => {
    const store = createStore();
    await openSeeded(store, "a");
    notes.editExternally("a", { bodyMarkdown: "agent text" });
    await store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "mine" },
    });

    await store.set(resolveNoteConflictAtom, {
      noteId: "a",
      choice: "use-remote",
    });

    expect(store.get(activeNoteAtom)?.bodyMarkdown).toBe("agent text");
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("agent text");
  });

  it("retries a save that failed for a transient reason", async () => {
    vi.useFakeTimers();
    const store = createStore();
    await openSeeded(store, "a");
    notes.ipc.update.mockRejectedValueOnce(new Error("daemon unavailable"));

    await store.set(saveNoteChangeAtom, {
      noteId: "a",
      change: { bodyMarkdown: "kept" },
    });
    expect(store.get(noteSaveStatusAtom)).toBe("error");

    await vi.advanceTimersByTimeAsync(3000);
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("kept");
    expect(store.get(noteSaveStatusAtom)).toBe("saved");
  });
});

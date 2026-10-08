import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingNoteBodyInsert,
  insertMarkdownIntoActiveNoteAtom,
  noteBodyInsertHandlerAtom,
} from "@/features/notes/note-body-insert";
import { resetNoteSaveStateForTests } from "@/features/notes/note-save-store";
import { activeNoteAtom } from "@/features/notes/notes-store";
import { createNoteServer, noteRecord } from "./note-server-mock";

const server = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/features/notes/notes-ipc", () => ({
  get notesIpc() {
    return (server.current as ReturnType<typeof createNoteServer>).ipc;
  },
}));

let notes: ReturnType<typeof createNoteServer>;

beforeEach(() => {
  resetNoteSaveStateForTests();
  notes = createNoteServer();
  server.current = notes;
});

describe("flushPendingNoteBodyInsert", () => {
  it("inserts pending markdown and resolves the waiter", () => {
    const resolve = vi.fn();
    let pending: {
      markdown: string;
      resolve: (ok: boolean) => void;
    } | null = {
      markdown: "> hi",
      resolve,
    };
    const handler = vi.fn(() => true);

    expect(
      flushPendingNoteBodyInsert(
        handler,
        () => pending,
        () => {
          pending = null;
        },
      ),
    ).toBe(true);
    expect(handler).toHaveBeenCalledWith("> hi");
    expect(resolve).toHaveBeenCalledWith(true);
    expect(pending).toBeNull();
  });
});

describe("insertMarkdownIntoActiveNoteAtom", () => {
  it("inserts immediately when a note body is mounted", async () => {
    const store = createStore();
    const insert = vi.fn(() => true);
    store.set(noteBodyInsertHandlerAtom, () => insert);
    store.set(activeNoteAtom, notes.seed(noteRecord("a")));

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> clip",
    });

    expect(result).toBe("inserted");
    expect(insert).toHaveBeenCalledWith("> clip");
    expect(notes.ipc.applyDocUpdate).not.toHaveBeenCalled();
  });

  it("creates a note and writes its doc without a mounted editor", async () => {
    const store = createStore();

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> clip",
      createTitle: "Guide",
    });

    expect(result).toBe("created");
    expect(notes.ipc.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Guide" }),
    );
    expect(store.get(activeNoteAtom)).toMatchObject({
      title: "Guide",
      bodyMarkdown: "> clip",
    });
  });

  it("appends to the daemon doc when the editor is not mounted", async () => {
    const store = createStore();
    store.set(
      activeNoteAtom,
      notes.seed(noteRecord("a", { bodyMarkdown: "> first" })),
    );
    notes.editBodyExternally("a", "> first\n\nagent line");

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> second",
    });

    expect(result).toBe("inserted");
    expect(notes.ipc.create).not.toHaveBeenCalled();
    expect(notes.notes.get("a")?.bodyMarkdown).toBe(
      "> first\n\nagent line\n\n> second",
    );
    expect(store.get(activeNoteAtom)?.bodyMarkdown).toBe(
      "> first\n\nagent line\n\n> second",
    );
  });
});

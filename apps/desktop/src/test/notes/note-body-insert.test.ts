import type { NoteRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingNoteBodyInsert,
  insertMarkdownIntoActiveNoteAtom,
  noteBodyInsertHandlerAtom,
} from "@/features/notes/note-body-insert";
import { activeNoteAtom } from "@/features/notes/notes-store";

const ipcMock = vi.hoisted(() => ({
  status: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/features/notes/notes-ipc", () => ({
  notesIpc: ipcMock,
}));

function makeRecord(
  id: string,
  overrides: Partial<NoteRecord> = {},
): NoteRecord {
  return {
    id,
    parentId: null,
    workspaceId: null,
    kind: "note",
    title: id.replace(/\.md$/, ""),
    icon: null,
    bodyMarkdown: "",
    sortOrder: 0,
    revision: 1,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  ipcMock.create.mockReset();
  ipcMock.update.mockReset();
  ipcMock.list.mockResolvedValue([]);
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
  it("inserts immediately when a file note body is mounted", async () => {
    const store = createStore();
    const insert = vi.fn(() => true);
    // Jotai treats function values as updaters — wrap to store the handler.
    store.set(noteBodyInsertHandlerAtom, () => insert);
    store.set(activeNoteAtom, makeRecord("a.md"));

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> clip",
    });

    expect(result).toBe("inserted");
    expect(insert).toHaveBeenCalledWith("> clip");
    expect(ipcMock.create).not.toHaveBeenCalled();
    expect(ipcMock.update).not.toHaveBeenCalled();
  });

  it("creates a note and writes via IPC without requiring a Notes tab mount", async () => {
    const store = createStore();
    const created = makeRecord("clip.md", { title: "Guide" });
    ipcMock.create.mockResolvedValue(created);
    ipcMock.update.mockResolvedValue({
      ...created,
      bodyMarkdown: "> clip",
      revision: 2,
    });

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> clip",
      createTitle: "Guide",
    });

    expect(result).toBe("created");
    expect(ipcMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Guide",
      }),
    );
    expect(ipcMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "clip.md",
        bodyMarkdown: "> clip",
      }),
    );
    expect(store.get(activeNoteAtom)?.bodyMarkdown).toBe("> clip");
  });

  it("appends via IPC when an active note exists but the editor is not mounted", async () => {
    const store = createStore();
    store.set(
      activeNoteAtom,
      makeRecord("a.md", { bodyMarkdown: "> first", revision: 3 }),
    );
    ipcMock.update.mockResolvedValue(
      makeRecord("a.md", {
        bodyMarkdown: "> first\n\n> second",
        revision: 4,
      }),
    );

    const result = await store.set(insertMarkdownIntoActiveNoteAtom, {
      markdown: "> second",
    });

    expect(result).toBe("inserted");
    expect(ipcMock.create).not.toHaveBeenCalled();
    expect(ipcMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyMarkdown: "> first\n\n> second",
        expectedRevision: 3,
      }),
    );
  });
});

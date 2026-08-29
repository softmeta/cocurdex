import type { NoteRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMock = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/features/notes/notes-ipc", () => ({ notesIpc: ipcMock }));

import {
  activeNoteAtom,
  createNoteAtom,
  loadNotesAtom,
  noteSummariesAtom,
  openNoteAtom,
} from "@/features/notes/notes-store";

function note(id: string): NoteRecord {
  const now = "2026-07-25T00:00:00.000Z";
  return {
    id,
    parentId: null,
    workspaceId: null,
    kind: "note",
    title: id,
    icon: null,
    sortOrder: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    bodyMarkdown: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ipcMock.list.mockResolvedValue([]);
});

describe("SQLite-backed notes store", () => {
  it("loads summaries without a filesystem root", async () => {
    ipcMock.list.mockResolvedValue([note("a"), note("b")]);
    const store = createStore();
    await store.set(loadNotesAtom);
    expect(store.get(noteSummariesAtom).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(ipcMock.list).toHaveBeenCalledWith();
  });

  it("opens and creates stable-id notes", async () => {
    const store = createStore();
    ipcMock.get.mockResolvedValue(note("a"));
    await store.set(openNoteAtom, "a");
    expect(store.get(activeNoteAtom)?.id).toBe("a");

    ipcMock.create.mockResolvedValue(note("new-id"));
    await store.set(createNoteAtom, null);
    expect(store.get(activeNoteAtom)?.id).toBe("new-id");
  });
});

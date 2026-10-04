import type { NoteRecord, UpdateNotePayload } from "@cocurdex/shared";
import { vi } from "vitest";

export function noteRecord(id: string, overrides: Partial<NoteRecord> = {}) {
  const now = "2026-10-04T00:00:00.000Z";
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
    ...overrides,
  } satisfies NoteRecord;
}

export function createNoteServer() {
  const notes = new Map<string, NoteRecord>();
  const ipc = {
    list: vi.fn(async () => [...notes.values()]),
    get: vi.fn(async ({ id }: { id: string }) => notes.get(id) ?? null),
    create: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(async ({ id }: { id: string }) => {
      notes.delete(id);
    }),
    update: vi.fn(async (payload: UpdateNotePayload) => {
      const current = notes.get(payload.id);
      if (!current) {
        throw new Error(`Note not found: ${payload.id}`);
      }
      if (
        payload.expectedRevision !== undefined &&
        payload.expectedRevision !== current.revision
      ) {
        throw new Error("Error invoking remote method: Note was modified");
      }
      const next: NoteRecord = {
        ...current,
        title: payload.title ?? current.title,
        bodyMarkdown: payload.bodyMarkdown ?? current.bodyMarkdown,
        revision: current.revision + 1,
      };
      notes.set(next.id, next);
      return next;
    }),
  };
  return {
    ipc,
    notes,
    seed(note: NoteRecord) {
      notes.set(note.id, note);
      return note;
    },
    editExternally(id: string, change: Partial<NoteRecord>) {
      const current = notes.get(id);
      if (!current) {
        throw new Error(`Missing note ${id}`);
      }
      notes.set(id, { ...current, ...change, revision: current.revision + 1 });
    },
  };
}

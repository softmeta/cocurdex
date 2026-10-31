import {
  applyMarkdownToNoteDoc,
  applyNoteDocUpdate,
  createNoteDocState,
  decodeNoteDocBytes,
  diffNoteDoc,
  encodeNoteDocBytes,
} from "@cocurdex/note-doc";
import type {
  ApplyNoteDocUpdatePayload,
  CreateNotePayload,
  GetNoteDocPayload,
  NoteRecord,
  UpdateNotePayload,
} from "@cocurdex/shared";
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
  const docs = new Map<string, Uint8Array>();

  const requireNote = (id: string) => {
    const current = notes.get(id);
    if (!current) {
      throw new Error(`Note not found: ${id}`);
    }
    return current;
  };

  const writeDoc = (id: string, state: Uint8Array, markdown: string) => {
    const current = requireNote(id);
    docs.set(id, state);
    const next = {
      ...current,
      bodyMarkdown: markdown,
      revision: current.revision + 1,
    };
    notes.set(id, next);
    return next;
  };

  const seed = (note: NoteRecord) => {
    notes.set(note.id, note);
    if (note.kind === "note") {
      docs.set(note.id, createNoteDocState(note.bodyMarkdown));
    }
    return note;
  };

  const ipc = {
    list: vi.fn(async () => [...notes.values()]),
    get: vi.fn(async ({ id }: { id: string }) => notes.get(id) ?? null),
    create: vi.fn(async (payload: CreateNotePayload) =>
      seed(
        noteRecord(`note-${notes.size + 1}`, {
          parentId: payload.parentId ?? null,
          kind: payload.kind ?? "note",
          title: payload.title ?? "Untitled",
          bodyMarkdown: payload.bodyMarkdown ?? "",
        }),
      ),
    ),
    move: vi.fn(),
    delete: vi.fn(async ({ id }: { id: string }) => {
      notes.delete(id);
      docs.delete(id);
    }),
    getDoc: vi.fn(async ({ id, stateVector }: GetNoteDocPayload) => {
      const note = notes.get(id);
      const state = docs.get(id);
      if (!note || !state) {
        return null;
      }
      const update = stateVector
        ? diffNoteDoc(state, decodeNoteDocBytes(stateVector))
        : state;
      return {
        id,
        revision: note.revision,
        update: encodeNoteDocBytes(update),
      };
    }),
    applyDocUpdate: vi.fn(async ({ id, update }: ApplyNoteDocUpdatePayload) => {
      const state = docs.get(id);
      if (!state) {
        throw new Error(`Note not found: ${id}`);
      }
      const result = applyNoteDocUpdate(state, decodeNoteDocBytes(update));
      return result.changed
        ? writeDoc(id, result.state, result.markdown)
        : requireNote(id);
    }),
    update: vi.fn(async (payload: UpdateNotePayload) => {
      const current = requireNote(payload.id);
      if (
        payload.expectedRevision !== undefined &&
        payload.expectedRevision !== current.revision
      ) {
        throw new Error("Error invoking remote method: Note was modified");
      }
      const next: NoteRecord = {
        ...current,
        title: payload.title ?? current.title,
        revision: current.revision + 1,
      };
      notes.set(next.id, next);
      return next;
    }),
  };

  return {
    ipc,
    notes,
    seed,
    editExternally(id: string, change: Partial<NoteRecord>) {
      const current = requireNote(id);
      notes.set(id, { ...current, ...change, revision: current.revision + 1 });
    },
    editBodyExternally(id: string, markdown: string) {
      const state = docs.get(id);
      if (!state) {
        throw new Error(`Missing doc ${id}`);
      }
      const result = applyMarkdownToNoteDoc(state, markdown);
      writeDoc(id, result.state, result.markdown);
    },
  };
}

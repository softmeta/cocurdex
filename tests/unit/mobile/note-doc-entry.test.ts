import {
  createNoteDocEntry,
  type NoteDocConnection,
} from "@cocurdex/mobile/internal/notes/editor/note-doc-entry";
import { encodeNoteDocBytes } from "@cocurdex/note-doc/bytes";
import type { NoteRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

function noteHost() {
  const record = { id: "note-1", title: "" } as NoteRecord;
  const request = vi.fn(async (method: string, params: { title?: string }) => {
    switch (method) {
      case "note.getDoc":
        return {
          id: record.id,
          revision: 1,
          update: encodeNoteDocBytes(Y.encodeStateAsUpdate(new Y.Doc())),
        };
      case "note.update":
        return { ...record, title: params.title ?? "" };
      default:
        return record;
    }
  });
  const connection = {
    request,
    onEvent: () => () => undefined,
    subscribeState: () => () => undefined,
  } as unknown as NoteDocConnection;
  const released = vi.fn();
  const listChanged = vi.fn();
  const entry = createNoteDocEntry(
    connection,
    record.id,
    { saved: () => undefined, listChanged },
    released,
  );
  const deletes = () =>
    request.mock.calls.filter(([method]) => method === "note.delete").length;
  return { entry, released, listChanged, deletes };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("createNoteDocEntry", () => {
  it("deletes a new note left blank once its last view closes", async () => {
    const { entry, released, listChanged, deletes } = noteHost();
    entry.discardWhenBlank();
    const leave = entry.subscribe(() => undefined);
    await settle();

    leave();

    await vi.waitFor(() => expect(released).toHaveBeenCalledWith(entry));
    expect(deletes()).toBe(1);
    expect(listChanged).toHaveBeenCalled();
  });

  it("keeps a blank new note that is opened again before the save settles", async () => {
    const { entry, released, deletes } = noteHost();
    entry.discardWhenBlank();
    entry.subscribe(() => undefined)();
    const leaveAgain = entry.subscribe(() => undefined);
    await settle();

    expect(deletes()).toBe(0);
    expect(released).not.toHaveBeenCalled();

    leaveAgain();
    await vi.waitFor(() => expect(released).toHaveBeenCalled());
    expect(deletes()).toBe(1);
  });

  it("keeps a new note once it has a title", async () => {
    const { entry, released, deletes } = noteHost();
    entry.discardWhenBlank();
    const leave = entry.subscribe(() => undefined);
    await settle();
    entry.setTitle("Groceries");

    leave();

    await vi.waitFor(() => expect(released).toHaveBeenCalled());
    expect(deletes()).toBe(0);
  });

  it("never deletes an existing note that is blank", async () => {
    const { entry, released, deletes } = noteHost();
    const leave = entry.subscribe(() => undefined);
    await settle();

    leave();

    await vi.waitFor(() => expect(released).toHaveBeenCalled());
    expect(deletes()).toBe(0);
  });
});

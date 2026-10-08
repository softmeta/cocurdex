import {
  applyMarkdownToNoteDoc,
  decodeNoteDocBytes,
  noteDocToMarkdown,
} from "@cocurdex/note-doc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createNoteServer, noteRecord } from "./note-server-mock";

const server = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/features/notes/notes-ipc", () => ({
  get notesIpc() {
    return (server.current as ReturnType<typeof createNoteServer>).ipc;
  },
}));

import { flushNoteDoc, pullNoteDoc } from "@/features/notes/note-doc-registry";
import {
  attachNoteDocSession,
  createNoteDoc,
} from "@/features/notes/note-doc-session";

let notes: ReturnType<typeof createNoteServer>;
const detachers: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  notes = createNoteServer();
  server.current = notes;
});

afterEach(async () => {
  for (const detach of detachers.splice(0)) {
    detach();
  }
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

function editLocally(doc: Y.Doc, markdown: string) {
  const before = Y.encodeStateVector(doc);
  const next = applyMarkdownToNoteDoc(Y.encodeStateAsUpdate(doc), markdown);
  const peer = new Y.Doc();
  Y.applyUpdate(peer, next.state);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, before));
}

async function openSession(id: string, markdown: string) {
  notes.seed(noteRecord(id, { bodyMarkdown: markdown }));
  const snapshot = await notes.ipc.getDoc({ id });
  if (!snapshot) {
    throw new Error(`Missing doc ${id}`);
  }
  const doc = createNoteDoc(decodeNoteDocBytes(snapshot.update));
  const onStatus = vi.fn();
  const onSaved = vi.fn();
  detachers.push(attachNoteDocSession(id, doc, { onStatus, onSaved }));
  return { doc, onStatus, onSaved };
}

function docMarkdown(doc: Y.Doc) {
  return noteDocToMarkdown(Y.encodeStateAsUpdate(doc));
}

describe("note doc session", () => {
  it("batches quick local edits into one debounced update", async () => {
    const { doc, onStatus, onSaved } = await openSession("a", "Hello");

    editLocally(doc, "Hello there");
    editLocally(doc, "Hello there, world");
    await vi.advanceTimersByTimeAsync(300);

    expect(notes.ipc.applyDocUpdate).toHaveBeenCalledTimes(1);
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("Hello there, world");
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ bodyMarkdown: "Hello there, world" }),
    );
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });

  it("merges an agent edit with unsent local edits", async () => {
    const { doc } = await openSession("a", "First line\n\nSecond line");
    await vi.advanceTimersByTimeAsync(0);

    editLocally(doc, "First line edited\n\nSecond line");
    notes.editBodyExternally("a", "First line\n\nSecond line by agent");
    await pullNoteDoc("a");
    await vi.advanceTimersByTimeAsync(300);

    const merged = "First line edited\n\nSecond line by agent";
    expect(docMarkdown(doc)).toBe(merged);
    expect(notes.notes.get("a")?.bodyMarkdown).toBe(merged);
  });

  it("flushes pending edits when the editor detaches", async () => {
    const { doc } = await openSession("a", "Draft");
    editLocally(doc, "Draft, final");

    detachers.pop()?.();
    await flushNoteDoc("a");

    expect(notes.notes.get("a")?.bodyMarkdown).toBe("Draft, final");
  });

  it("retries an update that failed for a transient reason", async () => {
    const { doc, onStatus } = await openSession("a", "Hello");
    notes.ipc.applyDocUpdate.mockRejectedValueOnce(new Error("unavailable"));

    editLocally(doc, "Hello again");
    await vi.advanceTimersByTimeAsync(300);
    expect(onStatus).toHaveBeenLastCalledWith("error");

    await vi.advanceTimersByTimeAsync(3000);
    expect(notes.notes.get("a")?.bodyMarkdown).toBe("Hello again");
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });

  it("does not echo remote changes back to the daemon", async () => {
    await openSession("a", "Hello");
    notes.editBodyExternally("a", "Hello from the agent");

    await pullNoteDoc("a");
    await vi.advanceTimersByTimeAsync(300);

    expect(notes.ipc.applyDocUpdate).not.toHaveBeenCalled();
  });
});

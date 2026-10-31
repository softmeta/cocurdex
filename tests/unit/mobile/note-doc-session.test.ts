import {
  createNoteDocSession,
  type NoteDocApi,
} from "@cocurdex/mobile/internal/notes/editor/note-doc-session";
import {
  decodeNoteDocBytes,
  encodeNoteDocBytes,
} from "@cocurdex/note-doc/bytes";
import type { NoteRecord } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const TIMING = { sendDelayMs: 300, retryDelayMs: 3000 };

function serverApi() {
  const server = new Y.Doc();
  const record = { id: "note-1", title: "" } as NoteRecord;
  const calls = { applyDocUpdate: 0, updateTitle: [] as string[] };
  let failNext = false;
  const api: NoteDocApi = {
    async getDoc(stateVector) {
      const vector = stateVector ? decodeNoteDocBytes(stateVector) : undefined;
      return {
        id: record.id,
        revision: 1,
        update: encodeNoteDocBytes(Y.encodeStateAsUpdate(server, vector)),
      };
    },
    async applyDocUpdate(update) {
      calls.applyDocUpdate += 1;
      if (failNext) {
        failNext = false;
        throw new Error("offline");
      }
      Y.applyUpdate(server, decodeNoteDocBytes(update));
      return record;
    },
    async updateTitle(title) {
      calls.updateTitle.push(title);
      return { ...record, title };
    },
  };
  return { server, api, calls, failOnce: () => (failNext = true) };
}

function editorDoc(session: ReturnType<typeof createNoteDocSession>) {
  const view = new Y.Doc();
  Y.applyUpdate(view, decodeNoteDocBytes(session.state()));
  view.on("update", (update: Uint8Array) =>
    session.applyLocal(encodeNoteDocBytes(update)),
  );
  return view;
}

function text(doc: Y.Doc) {
  return doc.getText("body").toString();
}

describe("createNoteDocSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("batches local edits into one saved update", async () => {
    const { server, api, calls } = serverApi();
    const session = createNoteDocSession(api, () => undefined, TIMING);
    await session.load();
    const view = editorDoc(session);

    view.getText("body").insert(0, "Hello");
    view.getText("body").insert(5, " there");
    expect(session.snapshot().status).toBe("saving");

    await vi.advanceTimersByTimeAsync(TIMING.sendDelayMs);
    expect(calls.applyDocUpdate).toBe(1);
    expect(text(server)).toBe("Hello there");
    expect(session.snapshot().status).toBe("saved");
  });

  it("keeps edits after a failed save and retries them", async () => {
    const { server, api, calls, failOnce } = serverApi();
    const session = createNoteDocSession(api, () => undefined, TIMING);
    await session.load();
    const view = editorDoc(session);
    failOnce();

    view.getText("body").insert(0, "Draft");
    await vi.advanceTimersByTimeAsync(TIMING.sendDelayMs);
    expect(session.snapshot().status).toBe("error");
    expect(text(server)).toBe("");

    await vi.advanceTimersByTimeAsync(TIMING.retryDelayMs);
    expect(calls.applyDocUpdate).toBe(2);
    expect(text(server)).toBe("Draft");
    expect(session.snapshot().status).toBe("saved");
  });

  it("forwards remote changes to the editor without saving them back", async () => {
    const { server, api, calls } = serverApi();
    const session = createNoteDocSession(api, () => undefined, TIMING);
    await session.load();
    const view = new Y.Doc();
    Y.applyUpdate(view, decodeNoteDocBytes(session.state()));
    session.onRemoteUpdate((update) =>
      Y.applyUpdate(view, decodeNoteDocBytes(update)),
    );

    server.getText("body").insert(0, "From the agent");
    await session.pull();
    await vi.advanceTimersByTimeAsync(TIMING.sendDelayMs);

    expect(text(view)).toBe("From the agent");
    expect(calls.applyDocUpdate).toBe(0);
  });

  it("saves only the latest title and flushes on demand", async () => {
    const { api, calls } = serverApi();
    const saved: string[] = [];
    const session = createNoteDocSession(
      api,
      (note) => saved.push(note.title),
      TIMING,
    );
    await session.load();

    session.setTitle("Che");
    session.setTitle("Checkout");
    await session.flush();

    expect(calls.updateTitle).toEqual(["Checkout"]);
    expect(saved).toEqual(["Checkout"]);
  });

  it("reports a deleted note as missing", async () => {
    const { api } = serverApi();
    const session = createNoteDocSession(
      { ...api, getDoc: async () => null },
      () => undefined,
      TIMING,
    );
    await session.load();
    expect(session.snapshot()).toMatchObject({ loaded: false, missing: true });
  });

  it("treats a body of empty blocks as blank and any text as content", async () => {
    const { api } = serverApi();
    const session = createNoteDocSession(api, () => undefined, TIMING);
    await session.load();
    const view = editorDoc(session);
    const body = view.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    body.insert(0, [paragraph, new Y.XmlElement("paragraph")]);
    expect(session.isBlank()).toBe(true);

    const run = new Y.XmlText();
    paragraph.insert(0, [run]);
    run.insert(0, "  ");
    expect(session.isBlank()).toBe(true);

    run.insert(2, "<script", { bold: true });
    expect(session.isBlank()).toBe(false);
  });
});

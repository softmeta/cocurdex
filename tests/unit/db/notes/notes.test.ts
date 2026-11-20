import { tmpdir } from "node:os";
import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import {
  applyMarkdownToNoteDoc,
  noteDocStateVector,
  noteDocToMarkdown,
} from "@cocurdex/note-doc";
import { compareNoteSiblings } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function editorUpdate(state: Uint8Array, markdown: string): Uint8Array {
  const before = noteDocStateVector(state);
  return Y.diffUpdate(applyMarkdownToNoteDoc(state, markdown).state, before);
}

function createTestDatabase() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-notes-"), "cocurdex.sqlite"),
  );
  tempDirs.onCleanup(() => database.close());
  return database;
}

describe("CocurdexDatabase.notes title heading", () => {
  it("drops a leading H1 that repeats the title on create and update", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({
      title: "Storage plan",
      bodyMarkdown: "# Storage  plan\r\n\r\n## Summary\n\nUse SQLite.",
    });
    expect(note.bodyMarkdown).not.toContain("# Storage");
    expect(note.bodyMarkdown).toContain("## Summary");

    const updated = await database.notes.update({
      id: note.id,
      title: "Storage design",
      bodyMarkdown: "\n# Storage design #\nUse SQLite.",
    });
    expect(updated.title).toBe("Storage design");
    expect(updated.bodyMarkdown.trim()).toBe("Use SQLite.");
  });

  it("keeps a leading H1 that differs from the title", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({
      title: "Storage plan",
      bodyMarkdown: "# Background\n\nText.",
    });
    expect(note.bodyMarkdown).toContain("# Background");

    const updated = await database.notes.update({
      id: note.id,
      bodyMarkdown: "## Storage plan\n\nText.",
    });
    expect(updated.bodyMarkdown).toContain("## Storage plan");
  });

  it("takes an untitled note's title from its leading H1", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({
      bodyMarkdown: "# Storage plan\n\nUse SQLite.",
    });
    expect(note.title).toBe("Storage plan");
    expect(note.bodyMarkdown.trim()).toBe("Use SQLite.");
  });
});

describe("CocurdexDatabase.notes", () => {
  it("lists each note with a plain excerpt of its body", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({
      title: "Checkout",
      bodyMarkdown:
        "## Goal\n\nLet buyers pay on **one page** with [saved cards](https://example.invalid).",
    });
    const empty = await database.notes.create({ title: "Empty" });

    const listed = await database.notes.list();

    expect(listed.find((entry) => entry.id === note.id)?.excerpt).toBe(
      "Let buyers pay on one page with saved cards.",
    );
    expect(listed.find((entry) => entry.id === empty.id)).not.toHaveProperty(
      "excerpt",
    );
    expect(listed[0]).not.toHaveProperty("bodyMarkdown");
  });

  it("creates a stable note tree and rejects stale updates", async () => {
    const database = createTestDatabase();
    const folder = await database.notes.create({
      kind: "folder",
      title: "Design",
    });
    const note = await database.notes.create({
      parentId: folder.id,
      title: "Storage",
    });

    expect(await database.notes.list()).toEqual([
      expect.objectContaining({
        id: folder.id,
        parentId: null,
        kind: "folder",
        title: "Design",
      }),
      expect.objectContaining({
        id: note.id,
        parentId: folder.id,
        kind: "note",
        title: "Storage",
      }),
    ]);

    const updated = await database.notes.update({
      id: note.id,
      bodyMarkdown: "SQLite is the source of truth.",
      expectedRevision: note.revision,
    });
    expect(updated.revision).toBe(note.revision + 1);

    await expect(
      database.notes.update({
        id: note.id,
        title: "Stale overwrite",
        expectedRevision: note.revision,
      }),
    ).rejects.toMatchObject({ code: "NOTE_REVISION_CONFLICT" });

    const moved = await database.notes.move({
      id: note.id,
      parentId: null,
      expectedRevision: updated.revision,
    });
    expect(moved.id).toBe(note.id);
    expect(moved.parentId).toBeNull();
    database.close();
  });

  it("nests pages under pages and keeps a subtree in its root's workspace", async () => {
    const database = createTestDatabase();
    const now = "2026-10-08T00:00:00.000Z";
    for (const id of ["workspace-a", "workspace-b"]) {
      await database.workspaces.upsert({
        id,
        name: id,
        rootPaths: [path.join(tmpdir(), id)],
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        sortOrder: 1000,
      });
    }
    const root = await database.notes.create({
      workspaceId: "workspace-a",
      title: "Plan",
    });
    const child = await database.notes.create({
      parentId: root.id,
      title: "Milestones",
    });
    const grandchild = await database.notes.create({
      parentId: child.id,
      workspaceId: "workspace-b",
      title: "M1",
    });
    expect(child.workspaceId).toBe("workspace-a");
    expect(grandchild.workspaceId).toBe("workspace-a");

    const other = await database.notes.create({
      workspaceId: "workspace-b",
      title: "Research",
    });
    await database.notes.move({ id: child.id, parentId: other.id });
    const byId = async (id: string) =>
      (await database.notes.list()).find((note) => note.id === id);
    expect((await byId(child.id))?.workspaceId).toBe("workspace-b");
    expect((await byId(grandchild.id))?.workspaceId).toBe("workspace-b");

    await database.notes.move({
      id: child.id,
      parentId: null,
      workspaceId: null,
    });
    expect(await byId(child.id)).toMatchObject({
      parentId: null,
      workspaceId: null,
    });
    expect((await byId(grandchild.id))?.workspaceId).toBeNull();

    await database.notes.update({ id: child.id, workspaceId: "workspace-a" });
    expect((await byId(grandchild.id))?.workspaceId).toBe("workspace-a");

    await expect(
      database.notes.move({ id: child.id, parentId: grandchild.id }),
    ).rejects.toMatchObject({ reason: "note.cycle" });
    database.close();
  });

  it("places a moved note before or after a sibling and keeps the list in that order", async () => {
    const database = createTestDatabase();
    const parent = await database.notes.create({ title: "Roadmap" });
    const first = await database.notes.create({
      title: "A",
      parentId: parent.id,
    });
    const second = await database.notes.create({
      title: "B",
      parentId: parent.id,
    });
    const third = await database.notes.create({
      title: "C",
      parentId: parent.id,
    });
    const loose = await database.notes.create({ title: "Loose" });
    const childTitles = async () =>
      (await database.notes.list())
        .filter((note) => note.parentId === parent.id)
        .map((note) => note.title);

    await database.notes.move({
      id: third.id,
      parentId: parent.id,
      beforeId: first.id,
    });
    expect(await childTitles()).toEqual(["C", "A", "B"]);

    await database.notes.move({
      id: third.id,
      parentId: parent.id,
      afterId: first.id,
    });
    expect(await childTitles()).toEqual(["A", "C", "B"]);

    await database.notes.move({
      id: loose.id,
      parentId: parent.id,
      afterId: second.id,
    });
    expect(await childTitles()).toEqual(["A", "C", "B", "Loose"]);

    for (let round = 0; round < 60; round++) {
      await database.notes.move({
        id: second.id,
        parentId: parent.id,
        beforeId: third.id,
      });
      await database.notes.move({
        id: third.id,
        parentId: parent.id,
        beforeId: second.id,
      });
    }
    expect(await childTitles()).toEqual(["A", "C", "B", "Loose"]);
    database.close();
  });

  it("keeps tied siblings in their displayed order when a move renumbers them", async () => {
    const database = createTestDatabase();
    const parent = await database.notes.create({ title: "Roadmap" });
    for (const title of ["a", "B"]) {
      await database.notes.create({ title, parentId: parent.id, sortOrder: 0 });
    }
    const [lower] = (await database.notes.list()).filter(
      (note) => note.title === "a",
    );
    const mover = await database.notes.create({ title: "Mover" });

    await database.notes.move({
      id: mover.id,
      parentId: parent.id,
      afterId: lower.id,
    });

    const displayed = (await database.notes.list())
      .filter((note) => note.parentId === parent.id)
      .toSorted(compareNoteSiblings)
      .map((note) => note.title);
    expect(displayed).toEqual(["a", "Mover", "B"]);
    database.close();
  });

  it("refuses an anchor that is not a sibling at the destination", async () => {
    const database = createTestDatabase();
    const now = "2026-11-20T00:00:00.000Z";
    for (const id of ["workspace-a", "workspace-b"]) {
      await database.workspaces.upsert({
        id,
        name: id,
        rootPaths: [path.join(tmpdir(), id)],
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        sortOrder: 1000,
      });
    }
    const parent = await database.notes.create({ title: "Roadmap" });
    const child = await database.notes.create({
      title: "Spec",
      parentId: parent.id,
    });
    const top = await database.notes.create({
      title: "Loose",
      workspaceId: "workspace-a",
    });
    const otherSection = await database.notes.create({
      title: "Elsewhere",
      workspaceId: "workspace-b",
    });

    await expect(
      database.notes.move({ id: top.id, parentId: null, beforeId: child.id }),
    ).rejects.toMatchObject({ reason: "note.invalidAnchor" });
    await expect(
      database.notes.move({
        id: top.id,
        parentId: null,
        workspaceId: "workspace-a",
        beforeId: otherSection.id,
      }),
    ).rejects.toMatchObject({ reason: "note.invalidAnchor" });
    await expect(
      database.notes.move({ id: top.id, parentId: null, beforeId: top.id }),
    ).rejects.toMatchObject({ reason: "note.invalidAnchor" });
    expect((await database.notes.get(top.id))?.revision).toBe(top.revision);
    database.close();
  });

  it("maintains tags and backlinks as transactional projections", async () => {
    const database = createTestDatabase();
    const target = await database.notes.create({ title: "Architecture" });
    const source = await database.notes.create({ title: "Storage" });

    await database.notes.update({
      id: source.id,
      bodyMarkdown:
        "Use #SQLite and #数据库. See [[Architecture]] and [direct](note://" +
        `${target.id}).`,
      expectedRevision: source.revision,
    });

    await expect(database.notes.listTags(source.id)).resolves.toEqual([
      expect.objectContaining({ name: "sqlite" }),
      expect.objectContaining({ name: "数据库" }),
    ]);
    await expect(
      database.notes.listBacklinks({ id: target.id }),
    ).resolves.toEqual([
      {
        sourceNoteId: source.id,
        targetNoteId: target.id,
        targetRef: "Architecture",
        kind: "wikilink",
      },
      {
        sourceNoteId: source.id,
        targetNoteId: target.id,
        targetRef: target.id,
        kind: "markdown",
      },
    ]);
    database.close();
  });

  it("re-resolves wikilinks when titles change or notes are deleted", async () => {
    const database = createTestDatabase();
    const source = await database.notes.create({ title: "Index" });
    await database.notes.update({
      id: source.id,
      bodyMarkdown: "See [[Plan]].",
      expectedRevision: source.revision,
    });
    const first = await database.notes.create({ title: "Draft" });
    await database.notes.update({
      id: first.id,
      title: "Plan",
      expectedRevision: first.revision,
    });
    const second = await database.notes.create({ title: "Plan" });
    expect(await database.notes.listBacklinks({ id: first.id })).toHaveLength(
      1,
    );

    await database.notes.delete({ id: first.id });

    expect(await database.notes.listBacklinks({ id: second.id })).toEqual([
      expect.objectContaining({ sourceNoteId: source.id, targetRef: "Plan" }),
    ]);
    database.close();
  });

  it("drops tags that no note uses anymore", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({ title: "Tagged" });
    const tagged = await database.notes.update({
      id: note.id,
      bodyMarkdown: "#keep #drop",
      expectedRevision: note.revision,
    });
    const retagged = await database.notes.update({
      id: note.id,
      bodyMarkdown: "#keep",
      expectedRevision: tagged.revision,
    });
    expect((await database.notes.listTags()).map((tag) => tag.name)).toEqual([
      "keep",
    ]);

    await database.notes.delete({
      id: note.id,
      expectedRevision: retagged.revision,
    });
    expect(await database.notes.listTags()).toEqual([]);
    database.close();
  });

  it("creates a note with a body and its collaborative doc in one step", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({
      title: "Spec",
      bodyMarkdown: "# Scope\n\nTrack #sync work.",
    });

    expect(note.bodyMarkdown).toBe("# Scope\n\nTrack #sync work.");
    const doc = await database.notes.getDoc(note.id);
    expect(doc?.revision).toBe(note.revision);
    expect(noteDocToMarkdown(doc?.update as Uint8Array)).toBe(
      note.bodyMarkdown,
    );
    expect((await database.notes.listTags(note.id)).map((t) => t.name)).toEqual(
      ["sync"],
    );
    database.close();
  });

  it("has no collaborative doc for folders", async () => {
    const database = createTestDatabase();
    const folder = await database.notes.create({ kind: "folder" });

    expect(await database.notes.getDoc(folder.id)).toBeNull();
    database.close();
  });

  it("has no collaborative doc for a note that does not exist", async () => {
    const database = createTestDatabase();

    expect(await database.notes.getDoc("missing-note")).toBeNull();
    database.close();
  });

  it("applies editor updates without revision checks and projects markdown", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({ bodyMarkdown: "Draft" });
    const doc = await database.notes.getDoc(note.id);
    const update = editorUpdate(doc?.update as Uint8Array, "Draft #ready");

    const { note: saved } = await database.notes.applyDocUpdate({
      id: note.id,
      update,
    });
    const replayed = await database.notes.applyDocUpdate({
      id: note.id,
      update,
    });

    expect(saved.bodyMarkdown).toBe("Draft #ready");
    expect(saved.revision).toBe(note.revision + 1);
    expect(replayed).toEqual({ note: saved, changed: false });
    expect((await database.notes.listTags(note.id)).map((t) => t.name)).toEqual(
      ["ready"],
    );
    database.close();
  });

  it("merges an agent markdown write into the doc an editor is holding", async () => {
    const database = createTestDatabase();
    const note = await database.notes.create({ bodyMarkdown: "One\n\nTwo" });
    const editorState = (await database.notes.getDoc(note.id))?.update;
    const editor = new Y.Doc();
    Y.applyUpdate(editor, editorState as Uint8Array);

    await database.notes.update({
      id: note.id,
      bodyMarkdown: "One\n\nTwo, revised by the agent",
      expectedRevision: note.revision,
    });
    const diff = await database.notes.getDoc(
      note.id,
      Y.encodeStateVector(editor),
    );
    Y.applyUpdate(editor, diff?.update as Uint8Array);

    expect(noteDocToMarkdown(Y.encodeStateAsUpdate(editor))).toBe(
      "One\n\nTwo, revised by the agent",
    );
    expect(diff?.update.byteLength).toBeLessThan(
      (editorState as Uint8Array).byteLength,
    );
    database.close();
  });
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyMarkdownToNoteDoc,
  noteDocStateVector,
  noteDocToMarkdown,
} from "@cocurdex/note-doc";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCocurdexDatabase } from "../sqlite";

function editorUpdate(state: Uint8Array, markdown: string): Uint8Array {
  const before = noteDocStateVector(state);
  return Y.diffUpdate(applyMarkdownToNoteDoc(state, markdown).state, before);
}

function createTestDatabase() {
  return createCocurdexDatabase(
    path.join(
      mkdtempSync(path.join(tmpdir(), "cocurdex-notes-")),
      "cocurdex.sqlite",
    ),
  );
}

describe("CocurdexDatabase.notes", () => {
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
    ).rejects.toThrow("Note was modified");

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
    ).rejects.toThrow("own descendant");
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
      bodyMarkdown: "# Spec\n\nTrack #sync work.",
    });

    expect(note.bodyMarkdown).toBe("# Spec\n\nTrack #sync work.");
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

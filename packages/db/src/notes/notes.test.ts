import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

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
});

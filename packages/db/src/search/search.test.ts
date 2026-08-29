import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

describe("CocurdexDatabase.search", () => {
  it("searches notes and issues through the shared FTS projection", async () => {
    const database = createCocurdexDatabase(
      path.join(
        mkdtempSync(path.join(tmpdir(), "cocurdex-search-")),
        "cocurdex.sqlite",
      ),
    );
    const note = await database.notes.create({ title: "Storage design" });
    await database.notes.update({
      id: note.id,
      bodyMarkdown: "SQLite owns the durable note body.",
      expectedRevision: note.revision,
    });
    const issue = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      columnId: "backlog",
      title: "Add full text search",
      description: "Index SQLite content with FTS5.",
    });

    const results = await database.search.search({ query: "SQLite" });
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: note.id, kind: "note" }),
        expect.objectContaining({ id: issue.id, kind: "issue" }),
      ]),
    );
    database.close();
  });

  it("distinguishes all workspaces from unassigned records", async () => {
    const database = createCocurdexDatabase(
      path.join(
        mkdtempSync(path.join(tmpdir(), "cocurdex-search-scope-")),
        "cocurdex.sqlite",
      ),
    );
    await database.notes.create({
      title: "Unassigned scope",
      workspaceId: null,
    });
    const now = new Date().toISOString();
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "Workspace",
      rootPath: "/tmp/workspace-1",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });
    await database.notes.create({
      title: "Workspace scope",
      workspaceId: "workspace-1",
    });

    expect(await database.search.search({ query: "scope" })).toHaveLength(2);
    expect(
      await database.search.search({ query: "scope", workspaceId: null }),
    ).toEqual([expect.objectContaining({ title: "Unassigned scope" })]);
    database.close();
  });
});

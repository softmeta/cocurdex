import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

function createTestDatabase() {
  return createCocurdexDatabase(
    path.join(
      mkdtempSync(path.join(tmpdir(), "cocurdex-issues-")),
      "cocurdex.sqlite",
    ),
  );
}

describe("CocurdexDatabase.issues", () => {
  it("projects stable issues through transactional views", async () => {
    const database = createTestDatabase();
    const initial = await database.issues.loadView({
      viewId: DEFAULT_VIEW_ID,
    });
    expect(initial?.columns.map((column) => column.id)).toEqual([
      "backlog",
      "doing",
      "review",
      "done",
    ]);

    const issue = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      columnId: "backlog",
      title: "Move persistence to SQLite",
      description: "Keep a stable domain id.",
    });
    expect(issue.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const moved = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      columnId: "doing",
      sortOrder: 1000,
      expectedRevision: issue.revision,
    });
    expect(moved.id).toBe(issue.id);
    expect(moved.status).toBe("doing");
    expect(moved.revision).toBe(issue.revision + 1);

    await expect(
      database.issues.updateIssue({
        viewId: DEFAULT_VIEW_ID,
        id: issue.id,
        title: "Stale title",
        expectedRevision: issue.revision,
      }),
    ).rejects.toThrow("Issue was modified");

    const view = await database.issues.loadView({
      viewId: DEFAULT_VIEW_ID,
    });
    expect(view?.issues).toEqual([
      expect.objectContaining({
        id: issue.id,
        columnId: "doing",
        title: "Move persistence to SQLite",
      }),
    ]);
    database.close();
  });
});

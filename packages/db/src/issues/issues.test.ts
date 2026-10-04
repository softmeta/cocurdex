import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

function createTestDatabasePath() {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "cocurdex-issues-")),
    "cocurdex.sqlite",
  );
}

function createTestDatabase() {
  return createCocurdexDatabase(createTestDatabasePath());
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

  it("shares columns across views so status values stay valid", async () => {
    const database = createTestDatabase();
    const other = await database.issues.createView({ title: "Sprint" });
    const column = await database.issues.createColumn({
      field: "status",
      title: "Blocked",
    });
    const issue = await database.issues.createIssue({
      viewId: other.id,
      columnId: column.id,
      title: "Waiting on review",
    });

    const projectView = await database.issues.loadView({
      viewId: DEFAULT_VIEW_ID,
    });
    expect(projectView?.columns.map((entry) => entry.title)).toContain(
      "Blocked",
    );
    expect(projectView?.issues).toEqual([
      expect.objectContaining({ id: issue.id, columnId: column.id }),
    ]);
    await expect(
      database.issues.updateIssue({
        viewId: DEFAULT_VIEW_ID,
        id: issue.id,
        status: "not-a-column",
      }),
    ).rejects.toThrow("Issue status column not found");
    database.close();
  });

  it("moves issues to the fallback column when their column is deleted", async () => {
    const database = createTestDatabase();
    const issue = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      columnId: "doing",
      title: "In flight",
    });

    await database.issues.deleteColumn({ field: "status", id: "doing" });

    const moved = await database.issues.getIssue({ id: issue.id });
    expect(moved?.status).toBe("backlog");
    expect(moved?.revision).toBe(issue.revision + 1);
    database.close();
  });

  it("keeps deleted default columns deleted and refuses the last one", async () => {
    const databasePath = createTestDatabasePath();
    const database = createCocurdexDatabase(databasePath);
    for (const id of ["doing", "review", "done"]) {
      await database.issues.deleteColumn({ field: "status", id });
    }
    await expect(
      database.issues.deleteColumn({ field: "status", id: "backlog" }),
    ).rejects.toThrow("Cannot delete the last issue status column");
    database.close();

    const reopened = createCocurdexDatabase(databasePath);
    const view = await reopened.issues.loadView({ viewId: DEFAULT_VIEW_ID });
    expect(view?.columns.map((column) => column.id)).toEqual(["backlog"]);
    reopened.close();
  });

  it("derives the column from status when none is given", async () => {
    const database = createTestDatabase();
    const doing = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "From CLI",
      status: "doing",
    });
    const fallback = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "No status",
    });
    expect([doing.status, fallback.status]).toEqual(["doing", "backlog"]);
    expect(fallback.priority).toBe("none");
    database.close();
  });
});

import { tmpdir } from "node:os";
import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import {
  DEFAULT_VIEW_ID,
  UNGROUPED_COLUMN_ID,
  type ViewGroupBy,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function createTestDatabase() {
  return createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-grouping-"), "cocurdex.sqlite"),
  );
}

type TestDatabase = ReturnType<typeof createTestDatabase>;

async function groupView(database: TestDatabase, groupBy: ViewGroupBy) {
  const view = await database.issues.updateView({
    viewId: DEFAULT_VIEW_ID,
    groupBy,
  });
  return view;
}

function columnsOf(
  view: Awaited<ReturnType<typeof groupView>>,
  issueId: string,
) {
  return view.issues.find((issue) => issue.id === issueId)?.columnIds;
}

describe("issue view grouping", () => {
  it("groups by label, listing an issue under each of its labels", async () => {
    const database = createTestDatabase();
    const bug = await database.issues.createLabel({ name: "Bug" });
    const ui = await database.issues.createLabel({ name: "UI" });
    const both = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "Both",
      labelIds: [bug.id, ui.id],
    });
    const none = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "None",
    });

    const view = await groupView(database, "label");
    expect(view.columns.map((column) => column.id)).toEqual([
      bug.id,
      ui.id,
      UNGROUPED_COLUMN_ID,
    ]);
    expect(columnsOf(view, both.id)).toEqual([bug.id, ui.id]);
    expect(columnsOf(view, none.id)).toEqual([UNGROUPED_COLUMN_ID]);
    database.close();
  });

  it("moving between label groups swaps only the dragged label", async () => {
    const database = createTestDatabase();
    const bug = await database.issues.createLabel({ name: "Bug" });
    const ui = await database.issues.createLabel({ name: "UI" });
    const api = await database.issues.createLabel({ name: "API" });
    const issue = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "Swap",
      labelIds: [bug.id, ui.id],
    });
    await groupView(database, "label");

    const moved = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      columnId: api.id,
      fromColumnId: bug.id,
      sortOrder: 0,
    });
    expect([...moved.labelIds].sort()).toEqual([api.id, ui.id].sort());

    const cleared = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      columnId: UNGROUPED_COLUMN_ID,
      fromColumnId: api.id,
      sortOrder: 0,
    });
    expect(cleared.labelIds).toEqual([]);
    database.close();
  });

  it("moves and creates issues under workspace and parent groups", async () => {
    const database = createTestDatabase();
    const now = "2026-11-04T00:00:00.000Z";
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "shop",
      rootPaths: [path.join(tmpdir(), "shop")],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    const parent = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "Epic",
    });
    const child = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      title: "Child",
    });

    await groupView(database, "workspace");
    const inWorkspace = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: child.id,
      columnId: "workspace-1",
      sortOrder: 0,
    });
    expect(inWorkspace.workspaceId).toBe("workspace-1");
    await expect(
      database.issues.moveIssue({
        viewId: DEFAULT_VIEW_ID,
        id: child.id,
        columnId: "missing",
        sortOrder: 0,
      }),
    ).rejects.toThrow("Workspace not found");

    await groupView(database, "parent");
    const nested = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: child.id,
      columnId: parent.id,
      sortOrder: 0,
    });
    expect(nested.parentId).toBe(parent.id);
    const created = await database.issues.createIssue({
      viewId: DEFAULT_VIEW_ID,
      columnId: parent.id,
      title: "Sibling",
    });
    expect(created.parentId).toBe(parent.id);
    expect(created.status).toBe("backlog");

    const view = await database.issues.loadView({ viewId: DEFAULT_VIEW_ID });
    expect(view?.columns.map((column) => column.title)).toEqual([
      `${parent.identifier} Epic`,
      "No parent",
    ]);
    await expect(
      database.issues.moveIssue({
        viewId: DEFAULT_VIEW_ID,
        id: parent.id,
        columnId: child.id,
        sortOrder: 0,
      }),
    ).rejects.toThrow();
    database.close();
  });

  it("stores view display settings and resets them with the view", async () => {
    const database = createTestDatabase();
    const updated = await database.issues.updateView({
      viewId: DEFAULT_VIEW_ID,
      display: { properties: ["identifier", "created"], showEmptyGroups: true },
    });
    expect(updated.view.display).toEqual({
      properties: ["identifier", "created"],
      showEmptyGroups: true,
    });
    await database.issues.deleteView({ viewId: DEFAULT_VIEW_ID });
    const reset = await database.issues.loadView({ viewId: DEFAULT_VIEW_ID });
    expect(reset?.view.display.showEmptyGroups).toBe(false);
    database.close();
  });
});

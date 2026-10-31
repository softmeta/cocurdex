import type { ViewFilter, ViewFull } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { buildComposeDraft } from "@/features/issues/compose-draft";

function boardWithFilters(filters: ViewFilter[]): ViewFull {
  return {
    view: {
      id: "project",
      title: "Project view",
      icon: null,
      groupBy: "status",
      layout: "board",
      filters,
      revision: 1,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    columns: [],
    statusOptions: [{ id: "backlog", title: "Backlog", category: "backlog" }],
    priorityOptions: [{ id: "none", title: "No priority", category: null }],
    labels: [],
    issues: [],
  };
}

const workspaceIds = ["active", "parent-ws", "filtered"];

describe("buildComposeDraft", () => {
  it("defaults a top-level issue to the active workspace", () => {
    const draft = buildComposeDraft({
      board: boardWithFilters([]),
      columnId: "backlog",
      parent: null,
      activeWorkspaceId: "active",
      workspaceIds,
    });

    expect(draft).toMatchObject({ workspaceId: "active", parentId: null });
  });

  it("puts a sub-issue in its parent's workspace", () => {
    const draft = buildComposeDraft({
      board: boardWithFilters([
        { field: "workspaceId", op: "eq", value: "filtered" },
      ]),
      columnId: "backlog",
      parent: { id: "p1", workspaceId: "parent-ws" },
      activeWorkspaceId: "active",
      workspaceIds,
    });

    expect(draft).toMatchObject({ workspaceId: "parent-ws", parentId: "p1" });
  });

  it("keeps a sub-issue of an unassigned parent unassigned", () => {
    const draft = buildComposeDraft({
      board: boardWithFilters([]),
      columnId: "backlog",
      parent: { id: "p1", workspaceId: null },
      activeWorkspaceId: "active",
      workspaceIds,
    });

    expect(draft).toMatchObject({ workspaceId: null, parentId: "p1" });
  });
});

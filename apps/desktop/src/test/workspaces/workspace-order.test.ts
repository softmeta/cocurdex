import type { WorkspaceRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  findMostRecentlyOpenedWorkspace,
  nextWorkspaceSortOrder,
  reorderWorkspacesById,
  sortWorkspacesByLastOpenedAtDesc,
  sortWorkspacesBySortOrder,
} from "@/features/workspaces/workspace-order";

function workspace(overrides: Partial<WorkspaceRecord> & { id: string }) {
  return {
    name: overrides.id,
    rootPath: `/ws/${overrides.id}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    lastOpenedAt: "2024-01-01T00:00:00.000Z",
    sortOrder: 1000,
    ...overrides,
  };
}

describe("workspace order", () => {
  it("sorts the inventory by sortOrder, then createdAt, then id", () => {
    const later = workspace({
      id: "later",
      createdAt: "2024-01-01T00:00:00.000Z",
      sortOrder: 3000,
    });
    const earlier = workspace({
      id: "earlier",
      createdAt: "2024-01-03T00:00:00.000Z",
      sortOrder: 1000,
    });
    const sameOrderB = workspace({
      id: "b",
      createdAt: "2024-01-02T00:00:00.000Z",
      sortOrder: 2000,
    });
    const sameOrderA = workspace({
      id: "a",
      createdAt: "2024-01-02T00:00:00.000Z",
      sortOrder: 2000,
    });

    expect(
      sortWorkspacesBySortOrder([later, sameOrderB, earlier, sameOrderA]).map(
        (item) => item.id,
      ),
    ).toEqual(["earlier", "a", "b", "later"]);
  });

  it("sorts recents by lastOpenedAt descending, then id", () => {
    const cold = workspace({
      id: "cold",
      lastOpenedAt: "2024-01-01T00:00:00.000Z",
    });
    const hot = workspace({
      id: "hot",
      lastOpenedAt: "2024-03-01T00:00:00.000Z",
    });
    const tiedB = workspace({
      id: "b",
      lastOpenedAt: "2024-02-01T00:00:00.000Z",
    });
    const tiedA = workspace({
      id: "a",
      lastOpenedAt: "2024-02-01T00:00:00.000Z",
    });

    expect(
      sortWorkspacesByLastOpenedAtDesc([cold, tiedB, hot, tiedA]).map(
        (item) => item.id,
      ),
    ).toEqual(["hot", "a", "b", "cold"]);
  });

  it("picks the most recently opened workspace", () => {
    const older = workspace({
      id: "older",
      lastOpenedAt: "2024-01-01T00:00:00.000Z",
    });
    const newer = workspace({
      id: "newer",
      lastOpenedAt: "2024-01-02T00:00:00.000Z",
    });

    expect(findMostRecentlyOpenedWorkspace([older, newer])?.id).toBe("newer");
    expect(findMostRecentlyOpenedWorkspace([])).toBeUndefined();
  });

  it("appends new projects after the current maximum sortOrder", () => {
    expect(nextWorkspaceSortOrder([])).toBe(1000);
    expect(
      nextWorkspaceSortOrder([
        workspace({ id: "a", sortOrder: 1000 }),
        workspace({ id: "b", sortOrder: 2500 }),
      ]),
    ).toBe(3500);
  });

  it("moves a project between neighbors without rewriting the rest", () => {
    const a = workspace({ id: "a", sortOrder: 1000 });
    const b = workspace({ id: "b", sortOrder: 2000 });
    const c = workspace({ id: "c", sortOrder: 3000 });

    const movedToFront = reorderWorkspacesById([a, b, c], "c", "a");
    expect(movedToFront?.workspaces.map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(movedToFront?.moved.sortOrder).toBe(0);

    const movedToEnd = reorderWorkspacesById([a, b, c], "a", "c");
    expect(movedToEnd?.workspaces.map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(movedToEnd?.moved.sortOrder).toBe(4000);

    expect(reorderWorkspacesById([a, b, c], "a", "a")).toBeNull();
    expect(reorderWorkspacesById([a, b, c], "a", "missing")).toBeNull();
  });
});

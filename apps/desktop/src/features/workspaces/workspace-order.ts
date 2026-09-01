import type { WorkspaceRecord } from "@cocurdex/shared";

export const WORKSPACE_SORT_STEP = 1000;

export function sortWorkspacesBySortOrder(
  workspaces: WorkspaceRecord[],
): WorkspaceRecord[] {
  return [...workspaces].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    const created = left.createdAt.localeCompare(right.createdAt);
    if (created !== 0) {
      return created;
    }
    return left.id.localeCompare(right.id);
  });
}

export function sortWorkspacesByLastOpenedAtDesc(
  workspaces: WorkspaceRecord[],
): WorkspaceRecord[] {
  return [...workspaces].sort((left, right) => {
    const opened = right.lastOpenedAt.localeCompare(left.lastOpenedAt);
    if (opened !== 0) {
      return opened;
    }
    return left.id.localeCompare(right.id);
  });
}

export function findMostRecentlyOpenedWorkspace(
  workspaces: WorkspaceRecord[],
): WorkspaceRecord | undefined {
  return sortWorkspacesByLastOpenedAtDesc(workspaces)[0];
}

export function nextWorkspaceSortOrder(workspaces: WorkspaceRecord[]): number {
  if (workspaces.length === 0) {
    return WORKSPACE_SORT_STEP;
  }
  return (
    Math.max(...workspaces.map((item) => item.sortOrder)) + WORKSPACE_SORT_STEP
  );
}

function sortOrderBetween(before?: number, after?: number): number {
  if (before !== undefined && after !== undefined) {
    return (before + after) / 2;
  }
  if (after !== undefined) {
    return after - WORKSPACE_SORT_STEP;
  }
  if (before !== undefined) {
    return before + WORKSPACE_SORT_STEP;
  }
  return WORKSPACE_SORT_STEP;
}

export function reorderWorkspacesById(
  workspaces: WorkspaceRecord[],
  activeId: string,
  overId: string,
): { workspaces: WorkspaceRecord[]; moved: WorkspaceRecord } | null {
  const from = workspaces.findIndex((item) => item.id === activeId);
  const to = workspaces.findIndex((item) => item.id === overId);
  if (from === -1 || to === -1 || from === to) {
    return null;
  }
  const reordered = [...workspaces];
  const [removed] = reordered.splice(from, 1);
  if (!removed) {
    return null;
  }
  reordered.splice(to, 0, removed);
  const moved = {
    ...removed,
    sortOrder: sortOrderBetween(
      reordered[to - 1]?.sortOrder,
      reordered[to + 1]?.sortOrder,
    ),
  };
  reordered[to] = moved;
  return { workspaces: reordered, moved };
}

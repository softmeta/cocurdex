import type { ViewFull } from "@cocurdex/shared";
import type { IssueComposeDraft } from "./dialogs";

function defaultWorkspaceId(
  board: ViewFull,
  activeWorkspaceId: string | null,
  workspaceIds: readonly string[],
): string | null {
  const filter = board.view.filters.find(
    (entry) => entry.field === "workspaceId",
  );
  if (filter?.op === "eq" && filter.value) {
    return filter.value;
  }
  if (filter?.op === "is_null") {
    return null;
  }
  return activeWorkspaceId && workspaceIds.includes(activeWorkspaceId)
    ? activeWorkspaceId
    : null;
}

export function buildComposeDraft({
  board,
  columnId,
  parentId,
  activeWorkspaceId,
  workspaceIds,
}: {
  board: ViewFull;
  columnId: string;
  parentId: string | null;
  activeWorkspaceId: string | null;
  workspaceIds: readonly string[];
}): IssueComposeDraft {
  const { groupBy } = board.view;
  const defaultPriority =
    board.priorityOptions.find((option) => option.id === "none")?.id ??
    board.priorityOptions.at(-1)?.id ??
    "";
  return {
    columnId,
    status:
      groupBy === "status" ? columnId : (board.statusOptions[0]?.id ?? ""),
    priority: groupBy === "priority" ? columnId : defaultPriority,
    workspaceId: defaultWorkspaceId(board, activeWorkspaceId, workspaceIds),
    parentId,
  };
}

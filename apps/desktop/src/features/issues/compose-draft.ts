import {
  type IssueRecord,
  UNGROUPED_COLUMN_ID,
  type ViewFull,
} from "@cocurdex/shared";
import type { IssueComposeDraft } from "./detail";

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
  parent,
  activeWorkspaceId,
  workspaceIds,
}: {
  board: ViewFull;
  columnId: string;
  parent: Pick<IssueRecord, "id" | "workspaceId"> | null;
  activeWorkspaceId: string | null;
  workspaceIds: readonly string[];
}): IssueComposeDraft {
  const { groupBy } = board.view;
  const group = columnId === UNGROUPED_COLUMN_ID ? null : columnId;
  const draftWorkspaceId = () => {
    if (parent) return parent.workspaceId;
    if (groupBy === "workspace") return group;
    return defaultWorkspaceId(board, activeWorkspaceId, workspaceIds);
  };
  const defaultPriority =
    board.priorityOptions.find((option) => option.id === "none")?.id ??
    board.priorityOptions.at(-1)?.id ??
    "";
  return {
    columnId,
    status:
      groupBy === "status" ? columnId : (board.statusOptions[0]?.id ?? ""),
    priority: groupBy === "priority" ? columnId : defaultPriority,
    workspaceId: draftWorkspaceId(),
    parentId: parent?.id ?? (groupBy === "parent" ? group : null),
    labelIds: groupBy === "label" && group ? [group] : [],
  };
}

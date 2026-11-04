import type { DatabaseSync } from "node:sqlite";
import {
  isIssueColumnField,
  UNGROUPED_COLUMN_ID,
  type ViewGroupBy,
} from "@cocurdex/shared";
import { requireLabel } from "./issue-links";
import { requireColumn } from "./issue-mutation-helpers";

export interface GroupedFieldValues {
  status?: string;
  priority?: string;
  workspaceId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
}

function requireWorkspace(database: DatabaseSync, id: string): string {
  const row = database
    .prepare("SELECT id FROM workspaces WHERE id = ?")
    .get(id) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Workspace not found: ${id}`);
  }
  return row.id;
}

function movedLabelIds(
  database: DatabaseSync,
  columnId: string,
  currentLabelIds: readonly string[],
  fromColumnId: string | undefined,
): string[] {
  if (columnId === UNGROUPED_COLUMN_ID) {
    return [];
  }
  const target = requireLabel(database, columnId).id;
  const kept = currentLabelIds.filter((id) => id !== fromColumnId);
  return [...new Set([...kept, target])];
}

export function groupedFieldsForColumn(
  database: DatabaseSync,
  groupBy: ViewGroupBy,
  columnId: string,
  currentLabelIds: readonly string[] = [],
  fromColumnId?: string,
): GroupedFieldValues {
  if (isIssueColumnField(groupBy)) {
    requireColumn(database, groupBy, columnId);
    return { [groupBy]: columnId };
  }
  const ungrouped = columnId === UNGROUPED_COLUMN_ID;
  switch (groupBy) {
    case "workspace":
      return {
        workspaceId: ungrouped ? null : requireWorkspace(database, columnId),
      };
    case "parent":
      return { parentId: ungrouped ? null : columnId };
    case "label":
      return {
        labelIds: movedLabelIds(
          database,
          columnId,
          currentLabelIds,
          fromColumnId,
        ),
      };
  }
}

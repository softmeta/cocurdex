import type { DatabaseSync } from "node:sqlite";
import {
  formatIssueIdentifier,
  type IssueColumnField,
  isIssueColumnField,
  UNGROUPED_COLUMN_ID,
  type ViewColumnRecord,
  type ViewGroupBy,
} from "@cocurdex/shared";
import {
  type ColumnRow,
  fallbackColumnId,
  type IssueRow,
  listColumns,
  mapColumn,
} from "./issue-storage";

export interface IssueGrouping {
  columns: ViewColumnRecord[];
  groupsOf(issue: IssueRow, labelIds: readonly string[]): string[];
}

interface DerivedGroupRow {
  id: string;
  title: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const UNGROUPED_TITLES: Record<
  Exclude<ViewGroupBy, IssueColumnField>,
  string
> = {
  label: "No label",
  workspace: "No workspace",
  parent: "No parent",
};

function derivedColumns(
  field: Exclude<ViewGroupBy, IssueColumnField>,
  rows: readonly DerivedGroupRow[],
): ViewColumnRecord[] {
  const columns = rows.map((row, index) => ({
    id: row.id,
    field,
    title: row.title,
    color: row.color,
    category: null,
    sortOrder: index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return [
    ...columns,
    {
      id: UNGROUPED_COLUMN_ID,
      field,
      title: UNGROUPED_TITLES[field],
      color: null,
      category: null,
      sortOrder: columns.length,
      createdAt: "",
      updatedAt: "",
    },
  ];
}

function derivedRows(
  database: DatabaseSync,
  field: Exclude<ViewGroupBy, IssueColumnField>,
): DerivedGroupRow[] {
  if (field === "label") {
    return database
      .prepare(
        `SELECT id, name AS title, color, created_at, updated_at
         FROM issue_labels ORDER BY name, id`,
      )
      .all() as unknown as DerivedGroupRow[];
  }
  if (field === "workspace") {
    return database
      .prepare(
        `SELECT id, name AS title, NULL AS color, created_at, updated_at
         FROM workspaces ORDER BY sort_order, created_at, id`,
      )
      .all() as unknown as DerivedGroupRow[];
  }
  const parents = database
    .prepare(
      `SELECT id, number, title, created_at, updated_at FROM issues
       WHERE id IN (SELECT parent_id FROM issues WHERE parent_id IS NOT NULL)
       ORDER BY number`,
    )
    .all() as unknown as (DerivedGroupRow & { number: number })[];
  return parents.map((parent) => ({
    id: parent.id,
    title: `${formatIssueIdentifier(parent.number)} ${parent.title}`,
    color: null,
    created_at: parent.created_at,
    updated_at: parent.updated_at,
  }));
}

function storedGrouping(
  database: DatabaseSync,
  field: IssueColumnField,
): IssueGrouping {
  const rows: ColumnRow[] = listColumns(database, field);
  const ids = new Set(rows.map((row) => row.id));
  const fallback = fallbackColumnId(rows, field);
  return {
    columns: rows.map(mapColumn),
    groupsOf(issue) {
      const value = field === "priority" ? issue.priority : issue.status;
      return [ids.has(value) ? value : fallback];
    },
  };
}

export function buildIssueGrouping(
  database: DatabaseSync,
  groupBy: ViewGroupBy,
): IssueGrouping {
  if (isIssueColumnField(groupBy)) {
    return storedGrouping(database, groupBy);
  }
  const columns = derivedColumns(groupBy, derivedRows(database, groupBy));
  const ids = new Set(columns.map((column) => column.id));
  const known = (values: readonly (string | null)[]) => {
    const present = values.filter(
      (value): value is string => value !== null && ids.has(value),
    );
    return present.length > 0 ? present : [UNGROUPED_COLUMN_ID];
  };
  return {
    columns,
    groupsOf(issue, labelIds) {
      if (groupBy === "label") return known(labelIds);
      if (groupBy === "workspace") return known([issue.workspace_id]);
      return issue.parent_id ? [issue.parent_id] : [UNGROUPED_COLUMN_ID];
    },
  };
}

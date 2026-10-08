import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_PRIORITY_COLUMNS,
  DEFAULT_STATUS_COLUMNS,
  DEFAULT_VIEW_ID,
  formatIssueIdentifier,
  type IssueFieldOption,
  type IssueLabel,
  type IssueRecord,
  type IssueStatusCategory,
  type IssueSummary,
  issueBodyExcerpt,
  issueMatchesFilters,
  parseIssueNumber,
  type ViewColumnRecord,
  type ViewFilter,
  type ViewFull,
  type ViewGroupBy,
  type ViewLayout,
  type ViewSummary,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import {
  IssueNotFoundError,
  IssueViewNotFoundError,
} from "./issue-tracker-repository";

export interface IssueRow extends SqliteRow {
  id: string;
  title: string;
  description_markdown: string;
  color: string | null;
  status: string;
  priority: string;
  workspace_id: string | null;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
  space_id: string;
  number: number;
  parent_id: string | null;
  completed_at: string | null;
}

export const LOCAL_ISSUE_SPACE_ID = "local";

export interface ViewRow extends SqliteRow {
  id: string;
  title: string;
  icon: string | null;
  group_by: ViewGroupBy;
  layout: ViewLayout;
  filters_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ColumnRow extends SqliteRow {
  field: ViewGroupBy;
  id: string;
  title: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category: IssueStatusCategory | null;
}

export interface LabelRow extends SqliteRow {
  id: string;
  name: string;
  color: string | null;
}

function parseFilters(raw: string): ViewFilter[] {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ViewFilter[]) : [];
}

export function mapViewSummary(row: ViewRow): ViewSummary {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    groupBy: row.group_by,
    layout: row.layout,
    filters: parseFilters(row.filters_json),
    revision: row.revision,
  };
}

export function mapColumn(row: ColumnRow): ViewColumnRecord {
  return {
    id: row.id,
    field: row.field,
    title: row.title,
    color: row.color,
    category: row.field === "status" ? row.category : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getView(
  database: DatabaseSync,
  viewId: string,
): ViewRow | null {
  return (
    (database.prepare("SELECT * FROM issue_views WHERE id = ?").get(viewId) as
      | ViewRow
      | undefined) ?? null
  );
}

export function requireView(database: DatabaseSync, viewId: string): ViewRow {
  const view = getView(database, viewId);
  if (!view) {
    throw new IssueViewNotFoundError(viewId);
  }
  return view;
}

export function getIssue(
  database: DatabaseSync,
  issueRef: string,
): IssueRow | null {
  const byId = database
    .prepare("SELECT * FROM issues WHERE id = ?")
    .get(issueRef) as IssueRow | undefined;
  if (byId) {
    return byId;
  }
  const number = parseIssueNumber(issueRef);
  if (number === null) {
    return null;
  }
  return (
    (database
      .prepare("SELECT * FROM issues WHERE space_id = ? AND number = ?")
      .get(LOCAL_ISSUE_SPACE_ID, number) as IssueRow | undefined) ?? null
  );
}

export function requireIssue(
  database: DatabaseSync,
  issueId: string,
): IssueRow {
  const issue = getIssue(database, issueId);
  if (!issue) {
    throw new IssueNotFoundError(issueId);
  }
  return issue;
}

export function listColumns(
  database: DatabaseSync,
  field: ViewGroupBy,
): ColumnRow[] {
  return database
    .prepare(
      `SELECT * FROM issue_columns
       WHERE field = ?
       ORDER BY sort_order, id`,
    )
    .all(field) as ColumnRow[];
}

export function fallbackColumnId(
  columns: readonly ColumnRow[],
  field: ViewGroupBy,
): string {
  if (field === "priority") {
    return (
      columns.find((column) => column.id === "none")?.id ??
      columns.at(-1)?.id ??
      "none"
    );
  }
  return columns[0]?.id ?? "backlog";
}

export function listLabels(database: DatabaseSync): IssueLabel[] {
  return (
    database
      .prepare("SELECT id, name, color FROM issue_labels ORDER BY name, id")
      .all() as LabelRow[]
  ).map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

export function listIssueLabelIds(
  database: DatabaseSync,
  issueId?: string,
): Map<string, string[]> {
  const rows = (
    issueId
      ? database
          .prepare(
            `SELECT l.issue_id, l.label_id FROM issue_label_links l
             JOIN issue_labels label ON label.id = l.label_id
             WHERE l.issue_id = ?
             ORDER BY label.name, label.id`,
          )
          .all(issueId)
      : database
          .prepare(
            `SELECT l.issue_id, l.label_id FROM issue_label_links l
             JOIN issue_labels label ON label.id = l.label_id
             ORDER BY label.name, label.id`,
          )
          .all()
  ) as { issue_id: string; label_id: string }[];
  const byIssue = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byIssue.get(row.issue_id) ?? [];
    ids.push(row.label_id);
    byIssue.set(row.issue_id, ids);
  }
  return byIssue;
}

export function statusCategories(
  database: DatabaseSync,
): Map<string, IssueStatusCategory | null> {
  return new Map(
    listColumns(database, "status").map((column) => [
      column.id,
      column.category,
    ]),
  );
}

export function toIssueSummary(
  issue: IssueRow,
  categories: Map<string, IssueStatusCategory | null>,
): IssueSummary {
  return {
    id: issue.id,
    identifier: formatIssueIdentifier(issue.number),
    title: issue.title,
    status: issue.status,
    statusCategory: categories.get(issue.status) ?? null,
  };
}

interface IssueProjection {
  view: ViewRow;
  columnIds: Set<string>;
  fallbackColumnId: string;
  categories: Map<string, IssueStatusCategory | null>;
  labelIds: Map<string, string[]>;
}

function toIssueRecord(
  issue: IssueRow,
  projection: IssueProjection,
  fullBody: boolean,
): IssueRecord {
  const { view } = projection;
  const rawColumnId =
    view.group_by === "priority" ? issue.priority : issue.status;
  return {
    id: issue.id,
    number: issue.number,
    identifier: formatIssueIdentifier(issue.number),
    columnId: projection.columnIds.has(rawColumnId)
      ? rawColumnId
      : projection.fallbackColumnId,
    viewId: view.id,
    title: issue.title,
    description: fullBody
      ? issue.description_markdown || null
      : issueBodyExcerpt(issue.description_markdown),
    color: issue.color,
    status: issue.status,
    statusCategory: projection.categories.get(issue.status) ?? null,
    priority: issue.priority,
    workspaceId: issue.workspace_id,
    parentId: issue.parent_id,
    labelIds: projection.labelIds.get(issue.id) ?? [],
    completedAt: issue.completed_at,
    sortOrder: issue.sort_order,
    revision: issue.revision,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function toFieldOption(column: ColumnRow): IssueFieldOption {
  return {
    id: column.id,
    title: column.title,
    category: column.field === "status" ? column.category : null,
  };
}

export function projectView(database: DatabaseSync, view: ViewRow): ViewFull {
  const statusColumns = listColumns(database, "status");
  const priorityColumns = listColumns(database, "priority");
  const activeColumns =
    view.group_by === "priority" ? priorityColumns : statusColumns;
  const projection: IssueProjection = {
    view,
    columnIds: new Set(activeColumns.map((column) => column.id)),
    fallbackColumnId: fallbackColumnId(activeColumns, view.group_by),
    categories: new Map(
      statusColumns.map((column) => [column.id, column.category]),
    ),
    labelIds: listIssueLabelIds(database),
  };
  const filters = parseFilters(view.filters_json);
  const issues = (
    database
      .prepare("SELECT * FROM issues ORDER BY sort_order, created_at, id")
      .all() as IssueRow[]
  )
    .map((issue) => toIssueRecord(issue, projection, false))
    .filter((issue) => issueMatchesFilters(issue, filters));

  return {
    view: {
      ...mapViewSummary(view),
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    },
    columns: activeColumns.map(mapColumn),
    statusOptions: statusColumns.map(toFieldOption),
    priorityOptions: priorityColumns.map(toFieldOption),
    labels: listLabels(database),
    issues,
  };
}

export function projectSingleIssue(
  database: DatabaseSync,
  issue: IssueRow,
  view: ViewRow,
): IssueRecord {
  const columns = listColumns(database, view.group_by);
  return toIssueRecord(
    issue,
    {
      view,
      columnIds: new Set(columns.map((column) => column.id)),
      fallbackColumnId: fallbackColumnId(columns, view.group_by),
      categories: statusCategories(database),
      labelIds: listIssueLabelIds(database, issue.id),
    },
    true,
  );
}

export function insertDefaultView(database: DatabaseSync): void {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO issue_views (
         id, title, icon, group_by, layout, filters_json, revision,
         created_at, updated_at
       ) VALUES (?, 'Project view', NULL, 'status', 'board', '[]', 1, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(DEFAULT_VIEW_ID, now, now);
  const insertColumn = database.prepare(
    `INSERT INTO issue_columns (
       field, id, title, color, category, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [field, columns] of [
    ["status", DEFAULT_STATUS_COLUMNS],
    ["priority", DEFAULT_PRIORITY_COLUMNS],
  ] as const) {
    if (listColumns(database, field).length > 0) {
      continue;
    }
    for (const column of columns) {
      insertColumn.run(
        field,
        column.id,
        column.title,
        column.color,
        column.category,
        column.order * 1000,
        now,
        now,
      );
    }
  }
}

export function insertView(
  database: DatabaseSync,
  title: string,
  icon: string | null,
): ViewRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO issue_views (
         id, title, icon, group_by, layout, filters_json, revision,
         created_at, updated_at
       ) VALUES (?, ?, ?, 'status', 'board', '[]', 1, ?, ?)`,
    )
    .run(id, title, icon, now, now);
  return requireView(database, id);
}

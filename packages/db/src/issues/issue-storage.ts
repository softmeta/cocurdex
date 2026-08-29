import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_PRIORITY_COLUMNS,
  DEFAULT_STATUS_COLUMNS,
  DEFAULT_VIEW_ID,
  type IssueRecord,
  issueBodyExcerpt,
  issueMatchesFilters,
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
}

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
  view_id: string;
  field: ViewGroupBy;
  id: string;
  title: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
    viewId: row.view_id,
    title: row.title,
    color: row.color,
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
  issueId: string,
): IssueRow | null {
  return (
    (database.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as
      | IssueRow
      | undefined) ?? null
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
  viewId: string,
  field: ViewGroupBy,
): ColumnRow[] {
  return database
    .prepare(
      `SELECT * FROM issue_view_columns
       WHERE view_id = ? AND field = ?
       ORDER BY sort_order, id`,
    )
    .all(viewId, field) as ColumnRow[];
}

function toIssueRecord(
  issue: IssueRow,
  view: ViewRow,
  columnIds: Set<string>,
  fallbackColumnId: string,
  fullBody: boolean,
): IssueRecord {
  const rawColumnId =
    view.group_by === "priority" ? issue.priority : issue.status;
  return {
    id: issue.id,
    columnId: columnIds.has(rawColumnId) ? rawColumnId : fallbackColumnId,
    viewId: view.id,
    title: issue.title,
    description: fullBody
      ? issue.description_markdown || null
      : issueBodyExcerpt(issue.description_markdown),
    color: issue.color,
    status: issue.status,
    priority: issue.priority,
    workspaceId: issue.workspace_id,
    sortOrder: issue.sort_order,
    revision: issue.revision,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

export function projectView(database: DatabaseSync, view: ViewRow): ViewFull {
  const activeColumns = listColumns(database, view.id, view.group_by);
  const statusColumns = listColumns(database, view.id, "status");
  const priorityColumns = listColumns(database, view.id, "priority");
  const columnIds = new Set(activeColumns.map((column) => column.id));
  const fallbackColumnId =
    view.group_by === "priority"
      ? (activeColumns.find((column) => column.id === "none")?.id ??
        activeColumns.at(-1)?.id ??
        "none")
      : (activeColumns[0]?.id ?? "backlog");
  const filters = parseFilters(view.filters_json);
  const issues = (
    database
      .prepare("SELECT * FROM issues ORDER BY sort_order, created_at, id")
      .all() as IssueRow[]
  )
    .filter((issue) =>
      issueMatchesFilters(
        {
          workspaceId: issue.workspace_id,
        },
        filters,
      ),
    )
    .map((issue) =>
      toIssueRecord(issue, view, columnIds, fallbackColumnId, false),
    );

  return {
    view: {
      ...mapViewSummary(view),
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    },
    columns: activeColumns.map(mapColumn),
    statusOptions: statusColumns.map((column) => ({
      id: column.id,
      title: column.title,
    })),
    priorityOptions: priorityColumns.map((column) => ({
      id: column.id,
      title: column.title,
    })),
    issues,
  };
}

export function projectSingleIssue(
  database: DatabaseSync,
  issue: IssueRow,
  view: ViewRow,
): IssueRecord {
  const columns = listColumns(database, view.id, view.group_by);
  const columnIds = new Set(columns.map((column) => column.id));
  const fallbackColumnId =
    view.group_by === "priority"
      ? (columns.find((column) => column.id === "none")?.id ??
        columns.at(-1)?.id ??
        "none")
      : (columns[0]?.id ?? "backlog");
  return toIssueRecord(issue, view, columnIds, fallbackColumnId, true);
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
    `INSERT INTO issue_view_columns (
       view_id, field, id, title, color, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(view_id, field, id) DO NOTHING`,
  );
  for (const [field, columns] of [
    ["status", DEFAULT_STATUS_COLUMNS],
    ["priority", DEFAULT_PRIORITY_COLUMNS],
  ] as const) {
    for (const column of columns) {
      insertColumn.run(
        DEFAULT_VIEW_ID,
        field,
        column.id,
        column.title,
        column.color,
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
  copyDefaultColumns(database, id, now);
  return requireView(database, id);
}

function copyDefaultColumns(
  database: DatabaseSync,
  viewId: string,
  now: string,
): void {
  const insertColumn = database.prepare(
    `INSERT INTO issue_view_columns (
       view_id, field, id, title, color, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [field, columns] of [
    ["status", DEFAULT_STATUS_COLUMNS],
    ["priority", DEFAULT_PRIORITY_COLUMNS],
  ] as const) {
    for (const column of columns) {
      insertColumn.run(
        viewId,
        field,
        column.id,
        column.title,
        column.color,
        column.order * 1000,
        now,
        now,
      );
    }
  }
}

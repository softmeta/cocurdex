import type { DatabaseSync } from "node:sqlite";
import {
  formatIssueIdentifier,
  type IssueFieldOption,
  type IssueRecord,
  type IssueStatusCategory,
  issueBodyExcerpt,
  issueMatchesFilters,
  type ViewFull,
} from "@cocurdex/shared";
import { buildIssueGrouping, type IssueGrouping } from "./issue-grouping";
import {
  type ColumnRow,
  type IssueRow,
  listColumns,
  listIssueLabelIds,
  listIssueSessionIds,
  listLabels,
  mapViewSummary,
  statusCategories,
  type ViewRow,
} from "./issue-storage";

interface IssueProjection {
  view: ViewRow;
  grouping: IssueGrouping;
  categories: Map<string, IssueStatusCategory | null>;
  labelIds: Map<string, string[]>;
  sessionIds: Map<string, string[]>;
}

function toIssueRecord(
  issue: IssueRow,
  projection: IssueProjection,
  fullBody: boolean,
): IssueRecord {
  const { view } = projection;
  const labelIds = projection.labelIds.get(issue.id) ?? [];
  const columnIds = projection.grouping.groupsOf(issue, labelIds);
  return {
    id: issue.id,
    number: issue.number,
    identifier: formatIssueIdentifier(issue.number),
    columnId: columnIds[0] ?? "",
    columnIds,
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
    labelIds,
    sessionIds: projection.sessionIds.get(issue.id) ?? [],
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
  const summary = mapViewSummary(view);
  const projection: IssueProjection = {
    view,
    grouping: buildIssueGrouping(database, view.group_by),
    categories: new Map(
      statusColumns.map((column) => [column.id, column.category]),
    ),
    labelIds: listIssueLabelIds(database),
    sessionIds: listIssueSessionIds(database),
  };
  const issues = (
    database
      .prepare("SELECT * FROM issues ORDER BY sort_order, created_at, id")
      .all() as IssueRow[]
  )
    .map((issue) => toIssueRecord(issue, projection, false))
    .filter((issue) => issueMatchesFilters(issue, summary.filters));

  return {
    view: {
      ...summary,
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    },
    columns: projection.grouping.columns,
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
  return toIssueRecord(
    issue,
    {
      view,
      grouping: buildIssueGrouping(database, view.group_by),
      categories: statusCategories(database),
      labelIds: listIssueLabelIds(database, issue.id),
      sessionIds: listIssueSessionIds(database, issue.id),
    },
    true,
  );
}

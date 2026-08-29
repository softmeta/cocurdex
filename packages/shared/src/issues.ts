export type ViewGroupBy = "status" | "priority";
export type ViewLayout = "board" | "list";
export type ViewFilterField = "workspaceId";
export type ViewFilterOp = "eq" | "is_null";

export interface ViewFilter {
  field: ViewFilterField;
  op: ViewFilterOp;
  value?: string;
}

export interface DefaultIssueColumn {
  id: string;
  title: string;
  order: number;
  color: string | null;
}

export const DEFAULT_PRIORITY_COLUMNS: DefaultIssueColumn[] = [
  { id: "urgent", title: "Urgent", order: 0, color: null },
  { id: "high", title: "High", order: 1, color: null },
  { id: "medium", title: "Medium", order: 2, color: null },
  { id: "low", title: "Low", order: 3, color: null },
  { id: "none", title: "No priority", order: 4, color: null },
];

export const DEFAULT_STATUS_COLUMNS: DefaultIssueColumn[] = [
  { id: "backlog", title: "Backlog", order: 0, color: null },
  { id: "doing", title: "Doing", order: 1, color: null },
  { id: "review", title: "Review", order: 2, color: null },
  { id: "done", title: "Done", order: 3, color: null },
];

export function issueMatchesFilters(
  issue: { workspaceId: string | null },
  filters: readonly ViewFilter[],
): boolean {
  return filters.every((filter) => {
    const workspaceId = issue.workspaceId?.trim() || null;
    if (filter.op === "is_null") {
      return workspaceId === null;
    }
    const target = filter.value?.trim();
    return Boolean(target) && workspaceId === target;
  });
}

export function issueBodyExcerpt(body: string, maxLength = 240): string | null {
  const plain = body
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) {
    return null;
  }
  return plain.length <= maxLength
    ? plain
    : `${plain.slice(0, maxLength).trimEnd()}…`;
}

/** Stable id of the built-in issue view. */
export const DEFAULT_VIEW_ID = "project";

export interface ViewRecord {
  id: string;
  title: string;
  icon: string | null;
  groupBy: ViewGroupBy;
  layout: ViewLayout;
  /** Saved filters for this view (AND). Empty = unfiltered pool. */
  filters: ViewFilter[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ViewSummary {
  id: string;
  title: string;
  icon: string | null;
  groupBy: ViewGroupBy;
  layout: ViewLayout;
  filters: ViewFilter[];
  revision: number;
}

export interface ViewColumnRecord {
  id: string;
  viewId: string;
  title: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Issue projected onto an issue view (column from active groupBy). */
export interface IssueRecord {
  id: string;
  /** Column id in the *current* groupBy view (status or priority value). */
  columnId: string;
  viewId: string;
  title: string;
  /**
   * View list loads: short plain-text excerpt (not full markdown).
   * `getIssue` / detail editor: full markdown body.
   */
  description: string | null;
  color: string | null;
  status: string;
  priority: string;
  /** Linked workspace id, or null when unassigned (no project). */
  workspaceId: string | null;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueFieldOption {
  id: string;
  title: string;
}

export interface ViewFull {
  view: ViewRecord;
  /** Columns for the active groupBy view. */
  columns: ViewColumnRecord[];
  /** Full status field options (for editors / chips). */
  statusOptions: IssueFieldOption[];
  /** Full priority field options (for editors / chips). */
  priorityOptions: IssueFieldOption[];
  issues: IssueRecord[];
}

export interface LoadViewPayload {
  viewId?: string;
}

export interface CreateViewPayload {
  title?: string;
  icon?: string | null;
}

export interface DeleteViewPayload {
  viewId: string;
  expectedRevision?: number;
}

export interface UpdateViewPayload {
  viewId: string;
  title?: string;
  icon?: string | null;
  groupBy?: ViewGroupBy;
  layout?: ViewLayout;
  filters?: ViewFilter[];
  expectedRevision?: number;
}

export interface CreateColumnPayload {
  viewId: string;
  title?: string;
  color?: string | null;
  sortOrder?: number;
}

export interface UpdateColumnPayload {
  viewId: string;
  id: string;
  title?: string;
  color?: string | null;
}

export interface MoveColumnPayload {
  viewId: string;
  id: string;
  sortOrder: number;
}

export interface DeleteColumnPayload {
  viewId: string;
  id: string;
}

export interface CreateIssuePayload {
  viewId: string;
  /** Column id under the view's current groupBy. */
  columnId: string;
  title?: string;
  description?: string | null;
  color?: string | null;
  status?: string;
  priority?: string;
  /** Null / omit = no project association. */
  workspaceId?: string | null;
  sortOrder?: number;
}

export interface UpdateIssuePayload {
  viewId: string;
  id: string;
  title?: string;
  description?: string | null;
  color?: string | null;
  status?: string;
  priority?: string;
  /** Null clears the association (no project). */
  workspaceId?: string | null;
  expectedRevision?: number;
}

export interface MoveIssuePayload {
  viewId: string;
  id: string;
  columnId: string;
  sortOrder: number;
  expectedRevision?: number;
}

export interface DeleteIssuePayload {
  id: string;
  expectedRevision?: number;
}

/** Load one issue with full markdown body for the detail editor. */
export interface GetIssuePayload {
  id: string;
  /** Optional view for column projection; defaults to default view. */
  viewId?: string;
}

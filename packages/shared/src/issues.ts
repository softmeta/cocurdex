export type IssueColumnField = "status" | "priority";

export const VIEW_GROUP_BY_FIELDS = [
  "status",
  "priority",
  "label",
  "workspace",
  "parent",
] as const;
export type ViewGroupBy = (typeof VIEW_GROUP_BY_FIELDS)[number];

export function isIssueColumnField(
  groupBy: ViewGroupBy,
): groupBy is IssueColumnField {
  return groupBy === "status" || groupBy === "priority";
}

export const UNGROUPED_COLUMN_ID = "__none__";

export const ISSUE_DISPLAY_PROPERTIES = [
  "identifier",
  "status",
  "priority",
  "labels",
  "workspace",
  "parent",
  "description",
  "created",
  "updated",
] as const;
export type IssueDisplayProperty = (typeof ISSUE_DISPLAY_PROPERTIES)[number];

export interface ViewDisplay {
  properties: IssueDisplayProperty[];
  showEmptyGroups: boolean;
}

export const DEFAULT_VIEW_DISPLAY: ViewDisplay = {
  properties: ["identifier", "status", "priority", "labels", "description"],
  showEmptyGroups: false,
};

export function normalizeViewDisplay(raw: unknown): ViewDisplay {
  if (!raw || typeof raw !== "object") return DEFAULT_VIEW_DISPLAY;
  const value = raw as { properties?: unknown; showEmptyGroups?: unknown };
  const properties = Array.isArray(value.properties)
    ? ISSUE_DISPLAY_PROPERTIES.filter((property) =>
        (value.properties as unknown[]).includes(property),
      )
    : DEFAULT_VIEW_DISPLAY.properties;
  return {
    properties,
    showEmptyGroups:
      typeof value.showEmptyGroups === "boolean"
        ? value.showEmptyGroups
        : DEFAULT_VIEW_DISPLAY.showEmptyGroups,
  };
}

export const ISSUE_CONFLICT_MESSAGE = "Issue was modified";

export function isIssueConflictError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(ISSUE_CONFLICT_MESSAGE)
  );
}
export const VIEW_LAYOUTS = ["board", "list"] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];
export const VIEW_FILTER_FIELDS = [
  "workspaceId",
  "labelId",
  "priority",
  "status",
  "statusCategory",
  "parentId",
  "createdAt",
  "updatedAt",
] as const;
export type ViewFilterField = (typeof VIEW_FILTER_FIELDS)[number];
export const VIEW_FILTER_OPS = ["eq", "neq", "is_null", "within_days"] as const;
export type ViewFilterOp = (typeof VIEW_FILTER_OPS)[number];

export const ISSUE_STATUS_CATEGORIES = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;
export type IssueStatusCategory = (typeof ISSUE_STATUS_CATEGORIES)[number];

export function isClosedStatusCategory(
  category: IssueStatusCategory | null,
): boolean {
  return category === "completed" || category === "canceled";
}

export const ISSUE_IDENTIFIER_PREFIX = "COC";

export function formatIssueIdentifier(number: number): string {
  return `${ISSUE_IDENTIFIER_PREFIX}-${number}`;
}

export function parseIssueNumber(ref: string): number | null {
  const match = /^(?:[A-Za-z]+-|#)?(\d+)$/u.exec(ref.trim());
  if (!match?.[1]) {
    return null;
  }
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export const ISSUE_RELATION_KINDS = ["blocks", "related", "duplicate"] as const;
export type IssueRelationKind = (typeof ISSUE_RELATION_KINDS)[number];

export type IssueActorKind = "user" | "cli" | "session";

export interface IssueActor {
  kind: IssueActorKind;
  sessionId?: string | null;
}

export interface IssueLabel {
  id: string;
  name: string;
  color: string | null;
}

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
  category: IssueStatusCategory | null;
}

export const DEFAULT_PRIORITY_COLUMNS: DefaultIssueColumn[] = [
  { id: "urgent", title: "Urgent", order: 0, color: null, category: null },
  { id: "high", title: "High", order: 1, color: null, category: null },
  { id: "medium", title: "Medium", order: 2, color: null, category: null },
  { id: "low", title: "Low", order: 3, color: null, category: null },
  { id: "none", title: "No priority", order: 4, color: null, category: null },
];

export const DEFAULT_STATUS_COLUMNS: DefaultIssueColumn[] = [
  {
    id: "backlog",
    title: "Backlog",
    order: 0,
    color: null,
    category: "backlog",
  },
  { id: "todo", title: "Todo", order: 1, color: null, category: "unstarted" },
  {
    id: "doing",
    title: "In Progress",
    order: 2,
    color: null,
    category: "started",
  },
  {
    id: "review",
    title: "In Review",
    order: 3,
    color: null,
    category: "started",
  },
  { id: "done", title: "Done", order: 4, color: null, category: "completed" },
  {
    id: "canceled",
    title: "Canceled",
    order: 5,
    color: null,
    category: "canceled",
  },
];

export interface OrderedIssueColumn {
  id: string;
  category: IssueStatusCategory | null;
  sortOrder: number;
}

const ISSUE_COLUMN_SORT_STEP = 1000;

function categoryRank(category: IssueStatusCategory | null): number {
  return category
    ? ISSUE_STATUS_CATEGORIES.indexOf(category)
    : ISSUE_STATUS_CATEGORIES.length;
}

export function compareIssueColumns(
  a: OrderedIssueColumn,
  b: OrderedIssueColumn,
): number {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

export function sortIssueColumns<T extends OrderedIssueColumn>(
  columns: readonly T[],
): T[] {
  return [...columns].sort(compareIssueColumns);
}

export function sortOrderForColumnPosition(
  columns: readonly OrderedIssueColumn[],
  columnId: string,
  index: number,
): number {
  const moving = columns.find((column) => column.id === columnId);
  const siblings = sortIssueColumns(
    columns.filter(
      (column) =>
        column.id !== columnId && column.category === moving?.category,
    ),
  );
  const position = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[position - 1]?.sortOrder;
  const after = siblings[position]?.sortOrder;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + ISSUE_COLUMN_SORT_STEP;
  if (after !== undefined) return after - ISSUE_COLUMN_SORT_STEP;
  return moving?.sortOrder ?? 0;
}

export function defaultStatusCategory(columnId: string): IssueStatusCategory {
  return (
    DEFAULT_STATUS_COLUMNS.find((column) => column.id === columnId)?.category ??
    "unstarted"
  );
}

export interface FilterableIssue {
  workspaceId: string | null;
  labelIds: readonly string[];
  priority: string;
  status: string;
  statusCategory: IssueStatusCategory | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function filterValues(
  issue: FilterableIssue,
  field: ViewFilterField,
): readonly string[] {
  switch (field) {
    case "labelId":
      return issue.labelIds;
    case "priority":
      return [issue.priority];
    case "status":
      return [issue.status];
    case "statusCategory":
      return issue.statusCategory ? [issue.statusCategory] : [];
    case "parentId":
      return issue.parentId ? [issue.parentId] : [];
    case "createdAt":
      return [issue.createdAt];
    case "updatedAt":
      return [issue.updatedAt];
    default: {
      const workspaceId = issue.workspaceId?.trim();
      return workspaceId ? [workspaceId] : [];
    }
  }
}

function withinDays(values: readonly string[], days: number, now: number) {
  return values.some((value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && now - time <= days * DAY_MS;
  });
}

function issueMatchesFilter(
  issue: FilterableIssue,
  filter: ViewFilter,
  now: number,
) {
  const values = filterValues(issue, filter.field);
  if (filter.op === "is_null") {
    return values.length === 0;
  }
  const target = filter.value?.trim();
  if (!target) {
    return false;
  }
  if (filter.op === "within_days") {
    const days = Number(target);
    return Number.isFinite(days) && days > 0 && withinDays(values, days, now);
  }
  const matches = values.includes(target);
  return filter.op === "neq" ? !matches : matches;
}

export function issueMatchesFilters(
  issue: FilterableIssue,
  filters: readonly ViewFilter[],
  now: number = Date.now(),
): boolean {
  return filters.every((filter) => issueMatchesFilter(issue, filter, now));
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
  display: ViewDisplay;
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
  display: ViewDisplay;
  revision: number;
}

export interface ViewColumnRecord {
  id: string;
  field: ViewGroupBy;
  title: string;
  color: string | null;
  category: IssueStatusCategory | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Issue projected onto an issue view (column from active groupBy). */
export interface IssueRecord {
  id: string;
  number: number;
  identifier: string;
  /** Column id in the *current* groupBy view (status or priority value). */
  columnId: string;
  columnIds: string[];
  viewId: string;
  title: string;
  /**
   * View list loads: short plain-text excerpt (not full markdown).
   * `getIssue` / detail editor: full markdown body.
   */
  description: string | null;
  color: string | null;
  status: string;
  statusCategory: IssueStatusCategory | null;
  priority: string;
  /** Linked workspace id, or null when unassigned (no workspace). */
  workspaceId: string | null;
  parentId: string | null;
  labelIds: string[];
  sessionIds: string[];
  completedAt: string | null;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueFieldOption {
  id: string;
  title: string;
  category: IssueStatusCategory | null;
}

export interface ViewFull {
  view: ViewRecord;
  /** Columns for the active groupBy view. */
  columns: ViewColumnRecord[];
  /** Full status field options (for editors / chips). */
  statusOptions: IssueFieldOption[];
  /** Full priority field options (for editors / chips). */
  priorityOptions: IssueFieldOption[];
  labels: IssueLabel[];
  issues: IssueRecord[];
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
  statusCategory: IssueStatusCategory | null;
}

export type IssueRelationDirection = "outgoing" | "incoming";

export interface IssueRelation {
  kind: IssueRelationKind;
  direction: IssueRelationDirection;
  issue: IssueSummary;
}

export interface IssueSessionLink {
  sessionId: string;
  title: string | null;
  status: string | null;
  workspaceId: string | null;
  linkedAt: string;
}

export type IssueChangeField =
  | "title"
  | "description"
  | "status"
  | "priority"
  | "workspace"
  | "parent"
  | "labels";

export interface IssueFieldChange {
  field: IssueChangeField;
  from: string | null;
  to: string | null;
}

export type IssueEventKind =
  | "created"
  | "updated"
  | "commented"
  | "relation_added"
  | "relation_removed"
  | "session_linked";

export interface IssueEvent {
  id: string;
  issueId: string;
  kind: IssueEventKind;
  actor: IssueActor;
  changes: IssueFieldChange[];
  body: string | null;
  relationKind: IssueRelationKind | null;
  relatedIssue: IssueSummary | null;
  sessionId: string | null;
  createdAt: string;
}

export interface IssueDetail {
  issue: IssueRecord;
  parent: IssueSummary | null;
  children: IssueSummary[];
  relations: IssueRelation[];
  sessions: IssueSessionLink[];
  events: IssueEvent[];
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
  display?: ViewDisplay;
  expectedRevision?: number;
}

export interface ListColumnsPayload {
  field: IssueColumnField;
}

export interface CreateColumnPayload {
  field: IssueColumnField;
  title?: string;
  color?: string | null;
  category?: IssueStatusCategory;
  sortOrder?: number;
}

export interface UpdateColumnPayload {
  field: IssueColumnField;
  id: string;
  title?: string;
  color?: string | null;
  category?: IssueStatusCategory;
}

export interface MoveColumnPayload {
  field: IssueColumnField;
  id: string;
  sortOrder: number;
}

export interface DeleteColumnPayload {
  field: IssueColumnField;
  id: string;
}

export interface CreateIssuePayload {
  viewId: string;
  /** Column id under the view's current groupBy; defaults from status/priority. */
  columnId?: string;
  title?: string;
  description?: string | null;
  color?: string | null;
  status?: string;
  priority?: string;
  /** Null / omit = no workspace association. */
  workspaceId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  sortOrder?: number;
  actor?: IssueActor;
}

export interface UpdateIssuePayload {
  viewId: string;
  id: string;
  title?: string;
  description?: string | null;
  color?: string | null;
  status?: string;
  priority?: string;
  /** Null clears the association (no workspace). */
  workspaceId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  expectedRevision?: number;
  actor?: IssueActor;
}

export interface MoveIssuePayload {
  viewId: string;
  id: string;
  columnId: string;
  fromColumnId?: string;
  sortOrder: number;
  expectedRevision?: number;
  actor?: IssueActor;
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

export interface GetIssueDetailPayload {
  id: string;
  viewId?: string;
}

export interface CreateIssueLabelPayload {
  name: string;
  color?: string | null;
}

export interface UpdateIssueLabelPayload {
  id: string;
  name?: string;
  color?: string | null;
}

export interface DeleteIssueLabelPayload {
  id: string;
}

export interface IssueRelationPayload {
  id: string;
  kind: IssueRelationKind;
  relatedId: string;
  actor?: IssueActor;
}

export interface CommentIssuePayload {
  id: string;
  body: string;
  actor?: IssueActor;
}

export interface LinkIssueSessionPayload {
  id: string;
  sessionId: string;
}

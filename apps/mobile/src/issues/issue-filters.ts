import type { IssueRecord } from "@cocurdex/shared";

export const ISSUE_FILTER_FIELDS = [
  "statuses",
  "priorities",
  "workspaceIds",
  "labelIds",
] as const;

export type IssueFilterField = (typeof ISSUE_FILTER_FIELDS)[number];
export type IssueFilters = Record<IssueFilterField, readonly string[]>;

export const NO_WORKSPACE_FILTER = "none";

export const EMPTY_ISSUE_FILTERS: IssueFilters = {
  statuses: [],
  priorities: [],
  workspaceIds: [],
  labelIds: [],
};

export function isIssueFilterField(value: unknown): value is IssueFilterField {
  return ISSUE_FILTER_FIELDS.some((field) => field === value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string"))];
}

export function normalizeIssueFilters(value: unknown): IssueFilters {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    statuses: stringList(record.statuses),
    priorities: stringList(record.priorities),
    workspaceIds: stringList(record.workspaceIds),
    labelIds: stringList(record.labelIds),
  };
}

function issueValues(issue: IssueRecord, field: IssueFilterField) {
  switch (field) {
    case "statuses":
      return [issue.status];
    case "priorities":
      return [issue.priority];
    case "workspaceIds":
      return [issue.workspaceId ?? NO_WORKSPACE_FILTER];
    case "labelIds":
      return issue.labelIds;
  }
}

export function issueMatchesFilters(issue: IssueRecord, filters: IssueFilters) {
  return ISSUE_FILTER_FIELDS.every((field) => {
    const selected = filters[field];
    if (selected.length === 0) return true;
    return issueValues(issue, field).some((value) => selected.includes(value));
  });
}

export function activeIssueFilterCount(filters: IssueFilters) {
  return ISSUE_FILTER_FIELDS.reduce(
    (count, field) => count + filters[field].length,
    0,
  );
}

export function toggledIssueFilter(
  filters: IssueFilters,
  field: IssueFilterField,
  value: string,
): IssueFilters {
  const selected = filters[field];
  return {
    ...filters,
    [field]: selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value],
  };
}

export function singleWorkspaceFilter(filters: IssueFilters) {
  const [only, ...rest] = filters.workspaceIds;
  if (!only || rest.length > 0 || only === NO_WORKSPACE_FILTER) return null;
  return only;
}

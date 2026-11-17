import {
  ALL_ISSUE_PLACE,
  type IssuePlace,
  normalizeIssuePlace,
} from "@cocurdex/client-runtime";
import { type IssueRecord, isIssueAgentActivity } from "@cocurdex/shared";

export const ISSUE_FILTER_FIELDS = [
  "statuses",
  "priorities",
  "labelIds",
] as const;

export type IssueFilterField = (typeof ISSUE_FILTER_FIELDS)[number];
export type IssueFilters = Record<IssueFilterField, readonly string[]>;

export const EMPTY_ISSUE_FILTERS: IssueFilters = {
  statuses: [],
  priorities: [],
  labelIds: [],
};

export interface IssueListState {
  filters: IssueFilters;
  place: IssuePlace;
}

export const DEFAULT_ISSUE_LIST_STATE: IssueListState = {
  filters: EMPTY_ISSUE_FILTERS,
  place: ALL_ISSUE_PLACE,
};

const LEGACY_NO_WORKSPACE = "none";

export function isIssueFilterField(value: unknown): value is IssueFilterField {
  return ISSUE_FILTER_FIELDS.some((field) => field === value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string"))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeIssueFilters(value: unknown): IssueFilters {
  const record = asRecord(value);
  return {
    statuses: stringList(record.statuses),
    priorities: stringList(record.priorities),
    labelIds: stringList(record.labelIds),
  };
}

function legacyPlace(record: Record<string, unknown>): IssuePlace {
  const workspaces = stringList(record.workspaceIds);
  const [workspaceId] = workspaces;
  if (
    workspaces.length === 1 &&
    workspaceId &&
    workspaceId !== LEGACY_NO_WORKSPACE
  ) {
    return { kind: "workspace", workspaceId };
  }
  const activities = stringList(record.agent).filter(isIssueAgentActivity);
  const [activity] = activities;
  if (activities.length === 1 && activity) return { kind: "agent", activity };
  return ALL_ISSUE_PLACE;
}

export function normalizeIssueListState(value: unknown): IssueListState {
  const record = asRecord(value);
  if ("filters" in record || "place" in record) {
    return {
      filters: normalizeIssueFilters(record.filters),
      place: normalizeIssuePlace(record.place),
    };
  }
  return { filters: normalizeIssueFilters(record), place: legacyPlace(record) };
}

function issueValues(issue: IssueRecord, field: IssueFilterField) {
  switch (field) {
    case "statuses":
      return [issue.status];
    case "priorities":
      return [issue.priority];
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

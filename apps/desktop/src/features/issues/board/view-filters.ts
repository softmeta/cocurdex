import {
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
  type ViewFilter,
} from "@cocurdex/shared";

export const FILTER_NO_WORKSPACE = "__no_workspace__";
export const FILTER_ALL = "__all__";

const CLOSED_CATEGORIES = ["completed", "canceled"] as const;

function withoutField(
  filters: readonly ViewFilter[],
  field: ViewFilter["field"],
): ViewFilter[] {
  return filters.filter((filter) => filter.field !== field);
}

export function workspaceSelection(filters: readonly ViewFilter[]): string {
  const filter = filters.find((entry) => entry.field === "workspaceId");
  if (filter?.op === "is_null") {
    return FILTER_NO_WORKSPACE;
  }
  if (filter?.op === "eq" && filter.value) {
    return filter.value;
  }
  return FILTER_ALL;
}

export function withWorkspaceSelection(
  filters: readonly ViewFilter[],
  selection: string,
): ViewFilter[] {
  const rest = withoutField(filters, "workspaceId");
  if (selection === FILTER_ALL) {
    return rest;
  }
  if (selection === FILTER_NO_WORKSPACE) {
    return [...rest, { field: "workspaceId", op: "is_null" }];
  }
  return [...rest, { field: "workspaceId", op: "eq", value: selection }];
}

export function labelSelection(filters: readonly ViewFilter[]): string {
  const filter = filters.find(
    (entry) => entry.field === "labelId" && entry.op === "eq",
  );
  return filter?.value ?? FILTER_ALL;
}

export function withLabelSelection(
  filters: readonly ViewFilter[],
  selection: string,
): ViewFilter[] {
  const rest = withoutField(filters, "labelId");
  return selection === FILTER_ALL
    ? rest
    : [...rest, { field: "labelId", op: "eq", value: selection }];
}

export function hidesClosedIssues(filters: readonly ViewFilter[]): boolean {
  return CLOSED_CATEGORIES.every((category) =>
    filters.some(
      (filter) =>
        filter.field === "statusCategory" &&
        filter.op === "neq" &&
        filter.value === category,
    ),
  );
}

function isClosedExclusion(filter: ViewFilter): boolean {
  return (
    filter.field === "statusCategory" &&
    filter.op === "neq" &&
    CLOSED_CATEGORIES.some((category) => category === filter.value)
  );
}

export function withHideClosedIssues(
  filters: readonly ViewFilter[],
  hide: boolean,
): ViewFilter[] {
  const rest = filters.filter((filter) => !isClosedExclusion(filter));
  if (!hide) {
    return rest;
  }
  return [
    ...rest,
    ...CLOSED_CATEGORIES.map(
      (value): ViewFilter => ({ field: "statusCategory", op: "neq", value }),
    ),
  ];
}

export function statusCategoryScope(
  filters: readonly ViewFilter[],
): IssueStatusCategory[] | null {
  const statusFilters = filters.filter(
    (filter) => filter.field === "statusCategory",
  );
  if (statusFilters.length === 0) {
    return null;
  }
  return ISSUE_STATUS_CATEGORIES.filter((category) =>
    statusFilters.every((filter) =>
      filter.op === "neq"
        ? filter.value !== category
        : filter.op === "eq" && filter.value === category,
    ),
  );
}

export function withoutStatusCategoryFilters(
  filters: readonly ViewFilter[],
): ViewFilter[] {
  return withoutField(filters, "statusCategory");
}

export function mergeFilters(
  base: readonly ViewFilter[],
  extra: readonly ViewFilter[],
): ViewFilter[] {
  const key = (filter: ViewFilter) =>
    `${filter.field}:${filter.op}:${filter.value ?? ""}`;
  const seen = new Set(base.map(key));
  return [...base, ...extra.filter((filter) => !seen.has(key(filter)))];
}

import type { ViewFilter } from "@cocurdex/shared";

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

export function withHideClosedIssues(
  filters: readonly ViewFilter[],
  hide: boolean,
): ViewFilter[] {
  const rest = withoutField(filters, "statusCategory");
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

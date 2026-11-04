import {
  ISSUE_STATUS_CATEGORIES,
  type IssueRecord,
  type IssueStatusCategory,
  type ViewColumnRecord,
  type ViewFilter,
} from "@cocurdex/shared";

export type IssueNavPreset = "all" | "active" | "backlog";

export type IssueNavSelection =
  | { kind: "issues"; preset: IssueNavPreset }
  | { kind: "view"; viewId: string };

export const DEFAULT_ISSUE_NAV: IssueNavSelection = {
  kind: "issues",
  preset: "all",
};

const PRESET_CATEGORIES: Record<
  Exclude<IssueNavPreset, "all">,
  readonly IssueStatusCategory[]
> = {
  active: ["unstarted", "started"],
  backlog: ["backlog"],
};

function matchesPreset(issue: IssueRecord, preset: IssueNavPreset): boolean {
  if (preset === "all") {
    return true;
  }
  return (
    issue.statusCategory !== null &&
    PRESET_CATEGORIES[preset].includes(issue.statusCategory)
  );
}

export function selectNavIssues(
  issues: IssueRecord[],
  selection: IssueNavSelection,
): IssueRecord[] {
  if (selection.kind === "view") {
    return issues;
  }
  return issues.filter((issue) => matchesPreset(issue, selection.preset));
}

function allowedColumnCategories(
  selection: IssueNavSelection,
): readonly IssueStatusCategory[] | null {
  if (selection.kind === "issues" && selection.preset !== "all") {
    return PRESET_CATEGORIES[selection.preset];
  }
  return null;
}

export function selectNavColumns(
  columns: ViewColumnRecord[],
  selection: IssueNavSelection,
): ViewColumnRecord[] {
  const allowed = allowedColumnCategories(selection);
  if (!allowed) {
    return columns;
  }
  return columns.filter(
    (column) =>
      column.field !== "status" ||
      column.category === null ||
      allowed.includes(column.category),
  );
}

export function presetScopeFilters(preset: IssueNavPreset): ViewFilter[] {
  if (preset === "all") {
    return [];
  }
  const allowed = PRESET_CATEGORIES[preset];
  return ISSUE_STATUS_CATEGORIES.filter(
    (category) => !allowed.includes(category),
  ).map((value) => ({ field: "statusCategory", op: "neq", value }));
}

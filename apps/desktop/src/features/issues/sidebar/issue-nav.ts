import {
  ISSUE_STATUS_CATEGORIES,
  type IssueAgentActivity,
  type IssueRecord,
  type IssueStatusCategory,
  type ViewColumnRecord,
  type ViewFilter,
} from "@cocurdex/shared";

const ISSUE_NAV_PRESETS = ["all", "active", "backlog"] as const;
export type IssueNavPreset = (typeof ISSUE_NAV_PRESETS)[number];

export function isNavPreset(value: string): value is IssueNavPreset {
  return ISSUE_NAV_PRESETS.some((preset) => preset === value);
}

export type IssueNavPlace =
  | { kind: "all" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "agent"; activity: IssueAgentActivity };

export type IssueNavSelection =
  | { kind: "issues"; preset: IssueNavPreset; place: IssueNavPlace }
  | { kind: "view"; viewId: string };

export type IssueActivityLookup = (
  sessionIds: readonly string[],
) => IssueAgentActivity | null;

const ALL_PLACE: IssueNavPlace = { kind: "all" };

export const DEFAULT_ISSUE_NAV: IssueNavSelection = {
  kind: "issues",
  preset: "all",
  place: ALL_PLACE,
};

export function navPlace(selection: IssueNavSelection): IssueNavPlace {
  return selection.kind === "issues" ? selection.place : ALL_PLACE;
}

export function isSamePlace(a: IssueNavPlace, b: IssueNavPlace): boolean {
  switch (a.kind) {
    case "all":
      return b.kind === "all";
    case "workspace":
      return b.kind === "workspace" && b.workspaceId === a.workspaceId;
    case "agent":
      return b.kind === "agent" && b.activity === a.activity;
  }
}

export function matchesPlace(
  issue: IssueRecord,
  place: IssueNavPlace,
  activityOf: IssueActivityLookup,
): boolean {
  switch (place.kind) {
    case "all":
      return true;
    case "workspace":
      return issue.workspaceId === place.workspaceId;
    case "agent":
      return activityOf(issue.sessionIds) === place.activity;
  }
}

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
  activityOf: IssueActivityLookup,
): IssueRecord[] {
  if (selection.kind === "view") {
    return issues;
  }
  return issues.filter(
    (issue) =>
      matchesPreset(issue, selection.preset) &&
      matchesPlace(issue, selection.place, activityOf),
  );
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

function presetScopeFilters(preset: IssueNavPreset): ViewFilter[] {
  if (preset === "all") {
    return [];
  }
  const allowed = PRESET_CATEGORIES[preset];
  return ISSUE_STATUS_CATEGORIES.filter(
    (category) => !allowed.includes(category),
  ).map((value) => ({ field: "statusCategory", op: "neq", value }));
}

export function canSaveNavScope(selection: IssueNavSelection): boolean {
  return selection.kind === "issues" && selection.place.kind !== "agent";
}

export function navScopeFilters(selection: IssueNavSelection): ViewFilter[] {
  if (selection.kind !== "issues") {
    return [];
  }
  const filters = presetScopeFilters(selection.preset);
  if (selection.place.kind === "workspace") {
    return [
      ...filters,
      { field: "workspaceId", op: "eq", value: selection.place.workspaceId },
    ];
  }
  return filters;
}

export function countNavPlace(
  issues: readonly IssueRecord[],
  preset: IssueNavPreset,
  place: IssueNavPlace,
  activityOf: IssueActivityLookup,
): number {
  let count = 0;
  for (const issue of issues) {
    if (
      matchesPreset(issue, preset) &&
      matchesPlace(issue, place, activityOf)
    ) {
      count += 1;
    }
  }
  return count;
}

export function workspacesWithIssues<T extends { id: string; name: string }>(
  workspaces: readonly T[],
  issues: readonly IssueRecord[],
): T[] {
  const used = new Set(issues.map((issue) => issue.workspaceId));
  return workspaces
    .filter((workspace) => used.has(workspace.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pinnedViewTabs<T extends { pinnedAt: string | null }>(
  views: readonly T[],
): T[] {
  return views
    .filter((view) => view.pinnedAt !== null)
    .sort((a, b) => (a.pinnedAt ?? "").localeCompare(b.pinnedAt ?? ""));
}

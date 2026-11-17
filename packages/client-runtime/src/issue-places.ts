import {
  type IssueActivityLookup,
  type IssueAgentActivity,
  type IssueRecord,
  isIssueAgentActivity,
} from "@cocurdex/shared";

export type IssuePlace =
  | { kind: "all" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "agent"; activity: IssueAgentActivity };

export const ALL_ISSUE_PLACE: IssuePlace = { kind: "all" };

export function isSameIssuePlace(a: IssuePlace, b: IssuePlace): boolean {
  switch (a.kind) {
    case "all":
      return b.kind === "all";
    case "workspace":
      return b.kind === "workspace" && b.workspaceId === a.workspaceId;
    case "agent":
      return b.kind === "agent" && b.activity === a.activity;
  }
}

export function matchesIssuePlace(
  issue: IssueRecord,
  place: IssuePlace,
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

export function countIssuePlace(
  issues: readonly IssueRecord[],
  place: IssuePlace,
  activityOf: IssueActivityLookup,
): number {
  let count = 0;
  for (const issue of issues) {
    if (matchesIssuePlace(issue, place, activityOf)) count += 1;
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

export function normalizeIssuePlace(value: unknown): IssuePlace {
  if (!value || typeof value !== "object") return ALL_ISSUE_PLACE;
  const record = value as Record<string, unknown>;
  if (record.kind === "workspace" && typeof record.workspaceId === "string") {
    return { kind: "workspace", workspaceId: record.workspaceId };
  }
  if (record.kind === "agent" && isIssueAgentActivity(record.activity)) {
    return { kind: "agent", activity: record.activity };
  }
  return ALL_ISSUE_PLACE;
}

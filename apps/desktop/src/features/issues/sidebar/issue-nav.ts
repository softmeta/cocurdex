import type {
  IssueRecord,
  IssueStatusCategory,
  SessionRecord,
} from "@cocurdex/shared";

export type IssueNavPreset = "all" | "active" | "backlog";

export type IssueNavSelection =
  | { kind: "issues"; preset: IssueNavPreset }
  | { kind: "agent" }
  | { kind: "view"; viewId: string };

export type IssueNavSession = Pick<
  SessionRecord,
  "id" | "status" | "archivedAt"
>;

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

const CLOSED_CATEGORIES: readonly IssueStatusCategory[] = [
  "completed",
  "canceled",
];

function matchesPreset(issue: IssueRecord, preset: IssueNavPreset): boolean {
  if (preset === "all") {
    return true;
  }
  return (
    issue.statusCategory !== null &&
    PRESET_CATEGORIES[preset].includes(issue.statusCategory)
  );
}

function isOpen(issue: IssueRecord): boolean {
  return (
    issue.statusCategory === null ||
    !CLOSED_CATEGORIES.includes(issue.statusCategory)
  );
}

function liveSessionStatuses(
  sessions: readonly IssueNavSession[],
): Map<string, IssueNavSession["status"]> {
  return new Map(
    sessions
      .filter((session) => !session.archivedAt)
      .map((session) => [session.id, session.status]),
  );
}

export function selectNavIssues(
  issues: IssueRecord[],
  selection: IssueNavSelection,
  sessions: readonly IssueNavSession[],
): IssueRecord[] {
  if (selection.kind === "view") {
    return issues;
  }
  if (selection.kind === "agent") {
    const live = liveSessionStatuses(sessions);
    return issues.filter(
      (issue) => isOpen(issue) && issue.sessionIds.some((id) => live.has(id)),
    );
  }
  return issues.filter((issue) => matchesPreset(issue, selection.preset));
}

export function countAgentRunningIssues(
  issues: readonly IssueRecord[],
  sessions: readonly IssueNavSession[],
): number {
  const live = liveSessionStatuses(sessions);
  return issues.filter(
    (issue) =>
      isOpen(issue) &&
      issue.sessionIds.some((id) => live.get(id) === "running"),
  ).length;
}

export function isSameIssueNav(
  left: IssueNavSelection,
  right: IssueNavSelection,
): boolean {
  if (left.kind === "issues" && right.kind === "issues") {
    return left.preset === right.preset;
  }
  if (left.kind === "view" && right.kind === "view") {
    return left.viewId === right.viewId;
  }
  return left.kind === right.kind;
}

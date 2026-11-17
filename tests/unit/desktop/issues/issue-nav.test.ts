import type { IssuePlace } from "@cocurdex/client-runtime";
import {
  type IssueRecord,
  type IssueStatusCategory,
  issueMatchesFilters,
  type ViewColumnRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  type IssueNavPreset,
  type IssueNavSelection,
  navScopeFilters,
  selectNavColumns,
  selectNavIssues,
} from "@/features/issues/sidebar/issue-nav";

const ALL: IssuePlace = { kind: "all" };
const noActivity = () => null;

function scope(
  preset: IssueNavPreset,
  place: IssuePlace = ALL,
): IssueNavSelection {
  return { kind: "issues", preset, place };
}

function issue(
  id: string,
  statusCategory: IssueStatusCategory | null,
  extra: Partial<IssueRecord> = {},
): IssueRecord {
  return {
    id,
    number: 1,
    identifier: `COC-${id}`,
    columnId: "backlog",
    columnIds: ["backlog"],
    viewId: "project",
    title: id,
    description: null,
    color: null,
    status: "backlog",
    statusCategory,
    priority: "none",
    workspaceId: null,
    parentId: null,
    labelIds: [],
    sessionIds: [],
    completedAt: null,
    sortOrder: 0,
    revision: 1,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    ...extra,
  };
}

const ids = (issues: IssueRecord[]) => issues.map((entry) => entry.id);

describe("selectNavIssues", () => {
  const issues = [
    issue("backlog-a", "backlog", { workspaceId: "a" }),
    issue("started-a", "started", { workspaceId: "a" }),
    issue("todo-b", "unstarted", { workspaceId: "b" }),
    issue("done-a", "completed", { workspaceId: "a" }),
    issue("loose", "started"),
  ];

  it("scopes issues by status preset", () => {
    expect(ids(selectNavIssues(issues, scope("all"), noActivity))).toEqual([
      "backlog-a",
      "started-a",
      "todo-b",
      "done-a",
      "loose",
    ]);
    expect(ids(selectNavIssues(issues, scope("active"), noActivity))).toEqual([
      "started-a",
      "todo-b",
      "loose",
    ]);
    expect(ids(selectNavIssues(issues, scope("backlog"), noActivity))).toEqual([
      "backlog-a",
    ]);
  });

  it("leaves a saved view's issues untouched", () => {
    expect(
      selectNavIssues(issues, { kind: "view", viewId: "custom" }, noActivity),
    ).toBe(issues);
  });

  it("narrows a status preset to a workspace or an agent state", () => {
    expect(
      ids(
        selectNavIssues(
          issues,
          scope("active", { kind: "workspace", workspaceId: "a" }),
          noActivity,
        ),
      ),
    ).toEqual(["started-a"]);
    const working = (sessionIds: readonly string[]) =>
      sessionIds.includes("run") ? ("working" as const) : null;
    const linked = [
      issue("busy", "started", { sessionIds: ["run"] }),
      issue("idle", "started", { sessionIds: ["done"] }),
    ];
    expect(
      ids(
        selectNavIssues(
          linked,
          scope("all", { kind: "agent", activity: "working" }),
          working,
        ),
      ),
    ).toEqual(["busy"]);
  });
});

function column(
  id: string,
  category: IssueStatusCategory | null,
  field: ViewColumnRecord["field"] = "status",
): ViewColumnRecord {
  return {
    id,
    field,
    title: id,
    color: null,
    category,
    sortOrder: 0,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
}

describe("selectNavColumns", () => {
  const statusColumns = [
    column("backlog", "backlog"),
    column("todo", "unstarted"),
    column("doing", "started"),
    column("done", "completed"),
    column("canceled", "canceled"),
    column("custom", null),
  ];
  const columnIds = (columns: ViewColumnRecord[]) =>
    columns.map((entry) => entry.id);

  it("shows only the status columns a preset can hold", () => {
    expect(columnIds(selectNavColumns(statusColumns, scope("active")))).toEqual(
      ["todo", "doing", "custom"],
    );
    expect(
      columnIds(selectNavColumns(statusColumns, scope("backlog"))),
    ).toEqual(["backlog", "custom"]);
  });

  it("keeps every column for all issues, saved views, and priority groups", () => {
    expect(selectNavColumns(statusColumns, scope("all"))).toBe(statusColumns);
    expect(
      selectNavColumns(statusColumns, { kind: "view", viewId: "custom" }),
    ).toBe(statusColumns);
    const priorityColumns = [column("urgent", null, "priority")];
    expect(selectNavColumns(priorityColumns, scope("active"))).toEqual(
      priorityColumns,
    );
  });
});

describe("navScopeFilters", () => {
  it("turns a preset and workspace into saved-view filters that select the same issues", () => {
    const issues = [
      issue("backlog-a", "backlog", { workspaceId: "a" }),
      issue("todo", "unstarted"),
      issue("started-a", "started", { workspaceId: "a" }),
      issue("started-b", "started", { workspaceId: "b" }),
      issue("done", "completed"),
      issue("canceled", "canceled"),
    ];
    const places: IssuePlace[] = [ALL, { kind: "workspace", workspaceId: "a" }];
    for (const place of places) {
      for (const preset of ["all", "active", "backlog"] as const) {
        const selection = scope(preset, place);
        const filters = navScopeFilters(selection);
        expect(
          ids(issues.filter((entry) => issueMatchesFilters(entry, filters))),
        ).toEqual(ids(selectNavIssues(issues, selection, noActivity)));
      }
    }
  });
});

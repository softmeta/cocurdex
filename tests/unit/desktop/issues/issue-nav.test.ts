import {
  type IssueRecord,
  type IssueStatusCategory,
  issueMatchesFilters,
  type ViewColumnRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  presetScopeFilters,
  selectNavColumns,
  selectNavIssues,
} from "@/features/issues/sidebar/issue-nav";

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
    expect(
      ids(selectNavIssues(issues, { kind: "issues", preset: "all" })),
    ).toEqual(["backlog-a", "started-a", "todo-b", "done-a", "loose"]);
    expect(
      ids(selectNavIssues(issues, { kind: "issues", preset: "active" })),
    ).toEqual(["started-a", "todo-b", "loose"]);
    expect(
      ids(selectNavIssues(issues, { kind: "issues", preset: "backlog" })),
    ).toEqual(["backlog-a"]);
  });

  it("leaves a saved view's issues untouched", () => {
    expect(selectNavIssues(issues, { kind: "view", viewId: "custom" })).toBe(
      issues,
    );
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
    expect(
      columnIds(
        selectNavColumns(statusColumns, { kind: "issues", preset: "active" }),
      ),
    ).toEqual(["todo", "doing", "custom"]);
    expect(
      columnIds(
        selectNavColumns(statusColumns, { kind: "issues", preset: "backlog" }),
      ),
    ).toEqual(["backlog", "custom"]);
  });

  it("keeps every column for all issues, saved views, and priority groups", () => {
    expect(
      selectNavColumns(statusColumns, { kind: "issues", preset: "all" }),
    ).toBe(statusColumns);
    expect(
      selectNavColumns(statusColumns, { kind: "view", viewId: "custom" }),
    ).toBe(statusColumns);
    const priorityColumns = [column("urgent", null, "priority")];
    expect(
      selectNavColumns(priorityColumns, { kind: "issues", preset: "active" }),
    ).toEqual(priorityColumns);
  });
});

describe("presetScopeFilters", () => {
  it("turns a preset into saved-view filters that select the same issues", () => {
    const issues = [
      issue("backlog-a", "backlog"),
      issue("todo", "unstarted"),
      issue("started", "started"),
      issue("done", "completed"),
      issue("canceled", "canceled"),
    ];
    for (const preset of ["all", "active", "backlog"] as const) {
      const filters = presetScopeFilters(preset);
      expect(
        ids(issues.filter((entry) => issueMatchesFilters(entry, filters))),
      ).toEqual(ids(selectNavIssues(issues, { kind: "issues", preset })));
    }
  });
});

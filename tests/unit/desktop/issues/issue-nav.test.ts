import type {
  IssueRecord,
  IssueStatusCategory,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  countAgentRunningIssues,
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

function session(
  id: string,
  status: SessionRecord["status"],
  archivedAt: string | null = null,
): Pick<SessionRecord, "id" | "status" | "archivedAt"> {
  return { id, status, archivedAt };
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
      ids(selectNavIssues(issues, { kind: "issues", preset: "all" }, [])),
    ).toEqual(["backlog-a", "started-a", "todo-b", "done-a", "loose"]);
    expect(
      ids(selectNavIssues(issues, { kind: "issues", preset: "active" }, [])),
    ).toEqual(["started-a", "todo-b", "loose"]);
    expect(
      ids(selectNavIssues(issues, { kind: "issues", preset: "backlog" }, [])),
    ).toEqual(["backlog-a"]);
  });

  it("leaves a saved view's issues untouched", () => {
    expect(
      selectNavIssues(issues, { kind: "view", viewId: "custom" }, []),
    ).toBe(issues);
  });

  it("lists open issues that a live agent session is working on", () => {
    const linked = [
      issue("running", "started", { sessionIds: ["s-run"] }),
      issue("idle", "unstarted", { sessionIds: ["s-idle"] }),
      issue("archived", "started", { sessionIds: ["s-archived"] }),
      issue("closed", "completed", { sessionIds: ["s-run"] }),
      issue("unlinked", "started"),
    ];
    const sessions = [
      session("s-run", "running"),
      session("s-idle", "idle"),
      session("s-archived", "idle", "2026-10-08T00:00:00.000Z"),
    ];

    expect(ids(selectNavIssues(linked, { kind: "agent" }, sessions))).toEqual([
      "running",
      "idle",
    ]);
    expect(countAgentRunningIssues(linked, sessions)).toBe(1);
  });
});

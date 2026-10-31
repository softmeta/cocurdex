import {
  EMPTY_ISSUE_FILTERS,
  type IssueFilters,
} from "@cocurdex/mobile/internal/issues/issue-filters";
import {
  issueSections,
  withIssueStatus,
} from "@cocurdex/mobile/internal/issues/issue-sections";
import type { IssueFieldOption, IssueRecord, ViewFull } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-25T00:00:00.000Z";

const statuses: IssueFieldOption[] = [
  { id: "backlog", title: "Backlog", category: "backlog" },
  { id: "todo", title: "Todo", category: "unstarted" },
  { id: "doing", title: "Doing", category: "started" },
  { id: "review", title: "Review", category: "started" },
  { id: "done", title: "Done", category: "completed" },
];

function issue(
  number: number,
  status: string,
  extra: Partial<IssueRecord> = {},
): IssueRecord {
  return {
    id: `issue-${number}`,
    number,
    identifier: `COC-${number}`,
    columnId: status,
    viewId: "view",
    title: `Issue ${number}`,
    description: null,
    color: null,
    status,
    statusCategory: null,
    priority: "none",
    workspaceId: "shop",
    parentId: null,
    labelIds: [],
    sessionIds: [],
    completedAt: null,
    sortOrder: number,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe("issueSections", () => {
  const issues = [
    issue(1, "done"),
    issue(2, "todo"),
    issue(3, "review", { title: "Round totals to cents" }),
    issue(4, "doing", { sortOrder: 9 }),
    issue(5, "doing", { sortOrder: 1 }),
    issue(6, "todo", { workspaceId: "docs" }),
  ];
  const inShop: IssueFilters = {
    ...EMPTY_ISSUE_FILTERS,
    workspaceIds: ["shop"],
  };

  it("puts work in progress first and drops empty statuses", () => {
    const sections = issueSections(issues, statuses, inShop, "");

    expect(
      sections.map((section) => [
        section.status.id,
        section.issues.map((entry) => entry.identifier),
      ]),
    ).toEqual([
      ["doing", ["COC-5", "COC-4"]],
      ["review", ["COC-3"]],
      ["todo", ["COC-2"]],
      ["done", ["COC-1"]],
    ]);
  });

  it("searches titles and identifiers across every workspace", () => {
    expect(
      issueSections(issues, statuses, EMPTY_ISSUE_FILTERS, "cents").flatMap(
        (section) => section.issues.map((entry) => entry.identifier),
      ),
    ).toEqual(["COC-3"]);
    expect(
      issueSections(issues, statuses, EMPTY_ISSUE_FILTERS, "coc-6").flatMap(
        (section) => section.issues.map((entry) => entry.identifier),
      ),
    ).toEqual(["COC-6"]);
  });
});

describe("withIssueStatus", () => {
  const view = {
    statusOptions: statuses,
    issues: [issue(1, "todo"), issue(2, "todo")],
  } as unknown as ViewFull;

  it("moves only the chosen issue and carries the status category", () => {
    const moved = withIssueStatus(view, "issue-1", "done");
    expect(
      moved.issues.map((entry) => [entry.status, entry.statusCategory]),
    ).toEqual([
      ["done", "completed"],
      ["todo", null],
    ]);
  });

  it("leaves the view untouched for an unknown status", () => {
    expect(withIssueStatus(view, "issue-1", "gone")).toBe(view);
  });
});

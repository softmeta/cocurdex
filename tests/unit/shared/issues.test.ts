import {
  type FilterableIssue,
  issueMatchesFilters,
  type OrderedIssueColumn,
  parseIssueNumber,
  sortIssueColumns,
  sortOrderForColumnPosition,
} from "@cocurdex/shared/internal/issues";
import { describe, expect, it } from "vitest";

describe("parseIssueNumber", () => {
  it("accepts identifiers, hash refs, and bare numbers", () => {
    expect(
      ["COC-12", "coc-12", "#12", " 12 "].map((ref) => parseIssueNumber(ref)),
    ).toEqual([12, 12, 12, 12]);
  });

  it("rejects ids that are not issue numbers", () => {
    expect(
      ["0", "COC-", "12a", "4f1c-2", "9007199254740993"].map((ref) =>
        parseIssueNumber(ref),
      ),
    ).toEqual([null, null, null, null, null]);
  });
});

describe("issueMatchesFilters", () => {
  const issue: FilterableIssue = {
    workspaceId: "w1",
    labelIds: ["bug", "agent"],
    priority: "high",
    status: "doing",
    statusCategory: "started",
    parentId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
  };

  it("combines filters with AND across fields", () => {
    expect(
      issueMatchesFilters(issue, [
        { field: "labelId", op: "eq", value: "bug" },
        { field: "statusCategory", op: "neq", value: "completed" },
        { field: "workspaceId", op: "eq", value: "w1" },
      ]),
    ).toBe(true);
    expect(
      issueMatchesFilters(issue, [
        { field: "labelId", op: "eq", value: "bug" },
        { field: "priority", op: "eq", value: "low" },
      ]),
    ).toBe(false);
  });

  it("treats is_null as an empty field", () => {
    expect(
      issueMatchesFilters({ ...issue, labelIds: [], workspaceId: " " }, [
        { field: "labelId", op: "is_null" },
        { field: "workspaceId", op: "is_null" },
      ]),
    ).toBe(true);
  });
  it("matches a status, top-level issues, and recent dates", () => {
    const now = Date.parse("2026-11-05T00:00:00.000Z");
    expect(
      issueMatchesFilters(
        issue,
        [
          { field: "status", op: "eq", value: "doing" },
          { field: "parentId", op: "is_null" },
          { field: "updatedAt", op: "within_days", value: "7" },
        ],
        now,
      ),
    ).toBe(true);
    expect(
      issueMatchesFilters(
        issue,
        [{ field: "createdAt", op: "within_days", value: "1" }],
        now,
      ),
    ).toBe(false);
    expect(
      issueMatchesFilters(
        { ...issue, parentId: "p1" },
        [{ field: "parentId", op: "is_null" }],
        now,
      ),
    ).toBe(false);
  });
});

describe("issue status order", () => {
  const columns: OrderedIssueColumn[] = [
    { id: "done", category: "completed", sortOrder: 0 },
    { id: "review", category: "started", sortOrder: 3000 },
    { id: "doing", category: "started", sortOrder: 1000 },
    { id: "backlog", category: "backlog", sortOrder: 5000 },
  ];

  it("orders statuses by category before their own order", () => {
    expect(sortIssueColumns(columns).map((column) => column.id)).toEqual([
      "backlog",
      "doing",
      "review",
      "done",
    ]);
  });

  it("places a status among the others of its category", () => {
    const first = sortOrderForColumnPosition(columns, "review", 0);
    const moved = sortIssueColumns(
      columns.map((column) =>
        column.id === "review" ? { ...column, sortOrder: first } : column,
      ),
    );
    expect(moved.map((column) => column.id)).toEqual([
      "backlog",
      "review",
      "doing",
      "done",
    ]);
    expect(sortOrderForColumnPosition(columns, "doing", 9)).toBe(4000);
  });
});

import type { IssueRecord, ViewColumnRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { issueStep, orderedIssueIds } from "@/features/issues/group-issues";

function column(id: string, sortOrder: number): ViewColumnRecord {
  return {
    id,
    field: "status",
    title: id,
    color: null,
    category: null,
    sortOrder,
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
  };
}

function issue(id: string, columnIds: string[], sortOrder: number) {
  return { id, columnIds, sortOrder } as IssueRecord;
}

describe("detail stepping order", () => {
  it("follows column order, then card order, listing a multi-group issue once", () => {
    const columns = [column("later", 2000), column("first", 1000)];
    const issues = [
      issue("b", ["first"], 2000),
      issue("shared", ["first", "later"], 1000),
      issue("c", ["later"], 500),
    ];
    const ordered = orderedIssueIds(columns, issues);
    expect(ordered).toEqual(["shared", "b", "c"]);
    expect(issueStep(ordered, "b")).toEqual({
      position: 2,
      total: 3,
      previousId: "shared",
      nextId: "c",
    });
    expect(issueStep(ordered, "shared")?.previousId).toBeNull();
    expect(issueStep(ordered, "c")?.nextId).toBeNull();
    expect(issueStep(ordered, "gone")).toBeNull();
  });
});

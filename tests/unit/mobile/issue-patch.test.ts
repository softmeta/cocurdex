import {
  issueTextPatch,
  patchedIssue,
  toggledLabelIds,
} from "@cocurdex/mobile/internal/issues/issue-patch";
import type { IssueFieldOption, IssueRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-27T00:00:00.000Z";

const issue: IssueRecord = {
  id: "issue-1",
  number: 1,
  identifier: "ACME-1",
  columnId: "todo",
  viewId: "view-1",
  title: "Store cart totals in cents",
  description: "Avoid float math.",
  color: null,
  status: "todo",
  statusCategory: "unstarted",
  priority: "none",
  workspaceId: null,
  parentId: null,
  labelIds: ["bug"],
  sessionIds: [],
  completedAt: null,
  sortOrder: 0,
  revision: 3,
  createdAt: now,
  updatedAt: now,
};

const statuses: IssueFieldOption[] = [
  { id: "todo", title: "Todo", category: "unstarted" },
  { id: "done", title: "Done", category: "completed" },
];

describe("patchedIssue", () => {
  it("moves the status category with the status", () => {
    expect(patchedIssue(issue, { status: "done" }, statuses)).toMatchObject({
      status: "done",
      statusCategory: "completed",
    });
  });

  it("keeps the category for fields other than status", () => {
    expect(
      patchedIssue(issue, { priority: "high", workspaceId: "ws" }, statuses),
    ).toMatchObject({
      priority: "high",
      workspaceId: "ws",
      statusCategory: "unstarted",
    });
  });
});

describe("toggledLabelIds", () => {
  it("adds a missing label and removes a present one", () => {
    expect(toggledLabelIds(["bug"], "ui")).toEqual(["bug", "ui"]);
    expect(toggledLabelIds(["bug", "ui"], "bug")).toEqual(["ui"]);
  });
});

describe("issueTextPatch", () => {
  it("sends only the fields that changed", () => {
    expect(issueTextPatch(issue, " Store cart totals in cents ", "")).toEqual({
      description: null,
    });
    expect(issueTextPatch(issue, "Cents", "Avoid float math.\n")).toEqual({
      title: "Cents",
    });
    expect(issueTextPatch(issue, issue.title, "Avoid float math.")).toEqual({});
  });
});

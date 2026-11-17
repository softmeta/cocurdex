import {
  activeIssueFilterCount,
  EMPTY_ISSUE_FILTERS,
  issueMatchesFilters,
  normalizeIssueFilters,
  normalizeIssueListState,
  toggledIssueFilter,
} from "@cocurdex/mobile/internal/issues/issue-filters";
import type { IssueRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function issue(extra: Partial<IssueRecord>): IssueRecord {
  return {
    status: "todo",
    priority: "none",
    workspaceId: "shop",
    labelIds: [],
    sessionIds: [],
    ...extra,
  } as IssueRecord;
}

describe("issueMatchesFilters", () => {
  it("matches any selected value within a field and every field together", () => {
    const filters = {
      ...EMPTY_ISSUE_FILTERS,
      statuses: ["todo", "doing"],
      priorities: ["high"],
    };
    expect(issueMatchesFilters(issue({ priority: "high" }), filters)).toBe(
      true,
    );
    expect(
      issueMatchesFilters(
        issue({ status: "doing", priority: "high" }),
        filters,
      ),
    ).toBe(true);
    expect(issueMatchesFilters(issue({ priority: "low" }), filters)).toBe(
      false,
    );
    expect(
      issueMatchesFilters(issue({ status: "done", priority: "high" }), filters),
    ).toBe(false);
  });

  it("matches an issue carrying any selected label", () => {
    const filters = { ...EMPTY_ISSUE_FILTERS, labelIds: ["bug"] };
    expect(
      issueMatchesFilters(issue({ labelIds: ["feature", "bug"] }), filters),
    ).toBe(true);
    expect(issueMatchesFilters(issue({ labelIds: [] }), filters)).toBe(false);
  });
});

describe("issue filter state", () => {
  it("toggles values and counts them", () => {
    const once = toggledIssueFilter(EMPTY_ISSUE_FILTERS, "labelIds", "bug");
    expect(activeIssueFilterCount(once)).toBe(1);
    expect(toggledIssueFilter(once, "labelIds", "bug")).toEqual(
      EMPTY_ISSUE_FILTERS,
    );
  });

  it("reads stored shapes defensively", () => {
    expect(normalizeIssueFilters(null)).toEqual(EMPTY_ISSUE_FILTERS);
    expect(
      normalizeIssueFilters({ statuses: ["todo", 3, "todo"], priorities: "x" }),
    ).toEqual({ ...EMPTY_ISSUE_FILTERS, statuses: ["todo"] });
  });

  it("moves a single stored workspace or agent filter into the place", () => {
    expect(
      normalizeIssueListState({ statuses: ["todo"], workspaceIds: ["shop"] }),
    ).toEqual({
      filters: { ...EMPTY_ISSUE_FILTERS, statuses: ["todo"] },
      place: { kind: "workspace", workspaceId: "shop" },
    });
    expect(normalizeIssueListState({ agent: ["needsYou"] }).place).toEqual({
      kind: "agent",
      activity: "needsYou",
    });
    expect(
      normalizeIssueListState({ workspaceIds: ["shop", "docs"] }).place,
    ).toEqual({ kind: "all" });
    expect(normalizeIssueListState({ workspaceIds: ["none"] }).place).toEqual({
      kind: "all",
    });
  });

  it("reads the current shape and drops unknown places", () => {
    const stored = {
      filters: { labelIds: ["bug"] },
      place: { kind: "workspace", workspaceId: "shop" },
    };
    expect(normalizeIssueListState(stored)).toEqual({
      filters: { ...EMPTY_ISSUE_FILTERS, labelIds: ["bug"] },
      place: { kind: "workspace", workspaceId: "shop" },
    });
    expect(
      normalizeIssueListState({ ...stored, place: { kind: "agent" } }).place,
    ).toEqual({ kind: "all" });
  });
});

import {
  activeIssueFilterCount,
  EMPTY_ISSUE_FILTERS,
  issueMatchesFilters,
  NO_WORKSPACE_FILTER,
  normalizeIssueFilters,
  singleWorkspaceFilter,
  toggledIssueFilter,
} from "@cocurdex/mobile/internal/issues/issue-filters";
import type { IssueRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const quiet = () => null;

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
  it("filters by the linked agent sessions' activity", () => {
    const filters = { ...EMPTY_ISSUE_FILTERS, agent: ["needsYou"] };
    const activityOf = (sessionIds: readonly string[]) =>
      sessionIds.includes("asking") ? ("needsYou" as const) : null;
    expect(
      issueMatchesFilters(
        issue({ sessionIds: ["asking"] }),
        filters,
        activityOf,
      ),
    ).toBe(true);
    expect(
      issueMatchesFilters(issue({ sessionIds: ["idle"] }), filters, activityOf),
    ).toBe(false);
  });

  it("matches any selected value within a field and every field together", () => {
    const filters = {
      ...EMPTY_ISSUE_FILTERS,
      statuses: ["todo", "doing"],
      priorities: ["high"],
    };
    expect(
      issueMatchesFilters(issue({ priority: "high" }), filters, quiet),
    ).toBe(true);
    expect(
      issueMatchesFilters(
        issue({ status: "doing", priority: "high" }),
        filters,
        quiet,
      ),
    ).toBe(true);
    expect(
      issueMatchesFilters(issue({ priority: "low" }), filters, quiet),
    ).toBe(false);
    expect(
      issueMatchesFilters(
        issue({ status: "done", priority: "high" }),
        filters,
        quiet,
      ),
    ).toBe(false);
  });

  it("matches issues without a workspace through the none value", () => {
    const filters = {
      ...EMPTY_ISSUE_FILTERS,
      workspaceIds: [NO_WORKSPACE_FILTER],
    };
    expect(
      issueMatchesFilters(issue({ workspaceId: null }), filters, quiet),
    ).toBe(true);
    expect(
      issueMatchesFilters(issue({ workspaceId: "shop" }), filters, quiet),
    ).toBe(false);
  });

  it("matches an issue carrying any selected label", () => {
    const filters = { ...EMPTY_ISSUE_FILTERS, labelIds: ["bug"] };
    expect(
      issueMatchesFilters(
        issue({ labelIds: ["feature", "bug"] }),
        filters,
        quiet,
      ),
    ).toBe(true);
    expect(issueMatchesFilters(issue({ labelIds: [] }), filters, quiet)).toBe(
      false,
    );
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

  it("offers a default workspace only for one real workspace", () => {
    const one = { ...EMPTY_ISSUE_FILTERS, workspaceIds: ["shop"] };
    expect(singleWorkspaceFilter(one)).toBe("shop");
    expect(
      singleWorkspaceFilter({ ...one, workspaceIds: ["shop", "docs"] }),
    ).toBeNull();
    expect(
      singleWorkspaceFilter({ ...one, workspaceIds: [NO_WORKSPACE_FILTER] }),
    ).toBeNull();
  });
});

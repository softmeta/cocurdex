import {
  defaultIssuePriority,
  defaultIssueStatus,
} from "@cocurdex/mobile/internal/issues/new-issue-defaults";
import type { IssueFieldOption } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const option = (
  id: string,
  category: IssueFieldOption["category"] = null,
): IssueFieldOption => ({ id, title: id, category });

describe("new issue defaults", () => {
  it("starts a new issue in the backlog column", () => {
    expect(
      defaultIssueStatus([
        option("doing", "started"),
        option("triage", "unstarted"),
        option("backlog", "backlog"),
      ]),
    ).toBe("backlog");
  });

  it("falls back to an unstarted column, then the first one", () => {
    expect(
      defaultIssueStatus([
        option("doing", "started"),
        option("todo", "unstarted"),
      ]),
    ).toBe("todo");
    expect(defaultIssueStatus([option("doing", "started")])).toBe("doing");
    expect(defaultIssueStatus([])).toBeUndefined();
  });

  it("gives a new issue no priority unless the view lacks that option", () => {
    expect(
      defaultIssuePriority([option("high"), option("none"), option("low")]),
    ).toBe("none");
    expect(defaultIssuePriority([option("high"), option("low")])).toBe("low");
  });
});

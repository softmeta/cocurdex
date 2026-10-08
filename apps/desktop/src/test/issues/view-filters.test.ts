import type { ViewFilter } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  FILTER_ALL,
  FILTER_NO_WORKSPACE,
  hidesClosedIssues,
  labelSelection,
  withHideClosedIssues,
  withLabelSelection,
  withWorkspaceSelection,
  workspaceSelection,
} from "@/features/issues/board/view-filters";

describe("view filter selections", () => {
  it("replaces one filter field without dropping the others", () => {
    const base: ViewFilter[] = [
      { field: "labelId", op: "eq", value: "bug" },
      { field: "workspaceId", op: "eq", value: "w1" },
    ];

    const noWorkspace = withWorkspaceSelection(base, FILTER_NO_WORKSPACE);
    expect(noWorkspace).toEqual([
      { field: "labelId", op: "eq", value: "bug" },
      { field: "workspaceId", op: "is_null" },
    ]);
    expect(workspaceSelection(noWorkspace)).toBe(FILTER_NO_WORKSPACE);

    const allWorkspaces = withWorkspaceSelection(noWorkspace, FILTER_ALL);
    expect(allWorkspaces).toEqual([
      { field: "labelId", op: "eq", value: "bug" },
    ]);
    expect(labelSelection(withLabelSelection(allWorkspaces, FILTER_ALL))).toBe(
      FILTER_ALL,
    );
  });

  it("hides both closed status categories together", () => {
    const hidden = withHideClosedIssues(
      [{ field: "workspaceId", op: "eq", value: "w1" }],
      true,
    );
    expect(hidesClosedIssues(hidden)).toBe(true);
    expect(
      hidesClosedIssues([
        { field: "statusCategory", op: "neq", value: "completed" },
      ]),
    ).toBe(false);

    const shown = withHideClosedIssues(hidden, false);
    expect(shown).toEqual([{ field: "workspaceId", op: "eq", value: "w1" }]);
    expect(hidesClosedIssues(shown)).toBe(false);
  });
});

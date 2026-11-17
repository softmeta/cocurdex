import { DEFAULT_VIEW_ID, type ViewFull } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { activeViewIdAtom, selectViewAtom } from "../issues-store";
import { useIssueActivityLookup } from "./issue-agent-activity";
import {
  DEFAULT_ISSUE_NAV,
  type IssueNavSelection,
  selectNavColumns,
  selectNavIssues,
} from "./issue-nav";

function resolveSelection(
  selection: IssueNavSelection,
  activeViewId: string,
): IssueNavSelection {
  if (activeViewId !== DEFAULT_VIEW_ID) {
    return { kind: "view", viewId: activeViewId };
  }
  return selection.kind === "view" ? DEFAULT_ISSUE_NAV : selection;
}

export function useIssueNav({ board }: { board: ViewFull | null }) {
  const activeViewId = useAtomValue(activeViewIdAtom);
  const selectView = useSetAtom(selectViewAtom);
  const activityOf = useIssueActivityLookup();
  const [selection, setSelection] =
    useState<IssueNavSelection>(DEFAULT_ISSUE_NAV);

  const effectiveSelection = resolveSelection(selection, activeViewId);

  const select = (next: IssueNavSelection) => {
    setSelection(next);
    const viewId = next.kind === "view" ? next.viewId : DEFAULT_VIEW_ID;
    if (viewId !== activeViewId) {
      void selectView(viewId);
    }
  };

  const scopedBoard = board
    ? {
        ...board,
        columns: selectNavColumns(board.columns, effectiveSelection),
        issues: selectNavIssues(board.issues, effectiveSelection, activityOf),
      }
    : null;

  return {
    activityOf,
    selection: effectiveSelection,
    select,
    scopedBoard,
  };
}

import { DEFAULT_VIEW_ID, type ViewFull } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { activeViewIdAtom, selectViewAtom } from "../issues-store";
import {
  countAgentRunningIssues,
  DEFAULT_ISSUE_NAV,
  type IssueNavSelection,
  type IssueNavSession,
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

export function useIssueNav({
  board,
  sessions,
}: {
  board: ViewFull | null;
  sessions: readonly IssueNavSession[];
}) {
  const activeViewId = useAtomValue(activeViewIdAtom);
  const selectView = useSetAtom(selectViewAtom);
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

  const builtInIssues =
    board?.view.id === DEFAULT_VIEW_ID ? board.issues : null;
  const scopedBoard = board
    ? {
        ...board,
        issues: selectNavIssues(board.issues, effectiveSelection, sessions),
      }
    : null;

  return {
    selection: effectiveSelection,
    select,
    scopedBoard,
    agentRunningCount: builtInIssues
      ? countAgentRunningIssues(builtInIssues, sessions)
      : 0,
  };
}

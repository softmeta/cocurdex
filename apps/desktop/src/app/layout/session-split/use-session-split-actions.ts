import { useAtomValue, useSetAtom } from "jotai";
import {
  activateSessionPaneAtom,
  closeSessionPaneAtom,
  collapseSessionSplitAtom,
  focusedPaneIdAtom,
  type SessionSplitDirection,
  sessionPaneCountAtom,
  splitFocusedPaneAtom,
} from "@/features/sessions";

export function useSessionSplitActions() {
  const focusedPaneId = useAtomValue(focusedPaneIdAtom);
  const paneCount = useAtomValue(sessionPaneCountAtom);
  const splitFocusedPane = useSetAtom(splitFocusedPaneAtom);
  const closeSessionPane = useSetAtom(closeSessionPaneAtom);
  const collapseSessionSplit = useSetAtom(collapseSessionSplitAtom);
  const activateSessionPane = useSetAtom(activateSessionPaneAtom);

  const splitPaneById = (paneId: string, direction: SessionSplitDirection) => {
    activateSessionPane(paneId);
    splitFocusedPane(direction);
  };

  const closePane = (paneId: string) => {
    const nextFocused = closeSessionPane(paneId);
    if (!nextFocused) {
      return null;
    }
    activateSessionPane(nextFocused.id);
    return nextFocused;
  };

  const closeAllPanes = (paneId: string) => {
    const kept = collapseSessionSplit(paneId);
    if (!kept) {
      return null;
    }
    activateSessionPane(kept.id);
    return kept;
  };

  return {
    closeAllPanes,
    closePane,
    focusedPaneId,
    focusSessionPane: activateSessionPane,
    paneCount,
    splitPaneById,
  };
}

import { useAtomValue, useSetAtom } from "jotai";
import { activeConversationIdAtom } from "@/features/chat";
import {
  activeSessionIdAtom,
  bindFocusedPaneContentAtom,
  closeSessionPaneAtom,
  collapseSessionSplitAtom,
  focusedPaneIdAtom,
  focusSessionPaneAtom,
  type SessionSplitDirection,
  sessionPaneCountAtom,
  splitFocusedPaneAtom,
} from "@/features/sessions";
import { sidebarTabAtom } from "../sidebar/sidebar-tab-store";

export function useSessionSplitActions() {
  const sidebarTab = useAtomValue(sidebarTabAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const activeConversationId = useAtomValue(activeConversationIdAtom);
  const focusedPaneId = useAtomValue(focusedPaneIdAtom);
  const paneCount = useAtomValue(sessionPaneCountAtom);
  const bindFocusedPane = useSetAtom(bindFocusedPaneContentAtom);
  const splitFocusedPane = useSetAtom(splitFocusedPaneAtom);
  const closeSessionPane = useSetAtom(closeSessionPaneAtom);
  const collapseSessionSplit = useSetAtom(collapseSessionSplitAtom);
  const focusSessionPane = useSetAtom(focusSessionPaneAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);

  const afterSplit = () => {
    setActiveSessionId(null);
    setActiveConversationId(null);
  };

  const bindVisibleContent = () => {
    if (sidebarTab === "chat") {
      bindFocusedPane({
        sessionId: null,
        conversationId: activeConversationId,
      });
      return;
    }
    bindFocusedPane({
      sessionId: activeSessionId,
      conversationId: null,
    });
  };

  const splitPaneById = (paneId: string, direction: SessionSplitDirection) => {
    focusSessionPane(paneId);
    if (paneCount <= 1) {
      bindVisibleContent();
    }
    if (!splitFocusedPane(direction)) {
      return;
    }
    afterSplit();
  };

  const closePane = (paneId: string) => {
    const nextFocused = closeSessionPane(paneId);
    if (!nextFocused) {
      return null;
    }
    setActiveSessionId(nextFocused.sessionId);
    setActiveConversationId(nextFocused.conversationId);
    return nextFocused;
  };

  const closeAllPanes = (paneId: string) => {
    const kept = collapseSessionSplit(paneId);
    if (!kept) {
      return null;
    }
    setActiveSessionId(kept.sessionId);
    setActiveConversationId(kept.conversationId);
    return kept;
  };

  return {
    closeAllPanes,
    closePane,
    focusedPaneId,
    focusSessionPane,
    paneCount,
    splitPaneById,
  };
}

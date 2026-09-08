import { useAtomValue, useSetAtom } from "jotai";
import { activeConversationIdAtom } from "@/features/chat";
import {
  activeSessionIdAtom,
  bindFocusedPaneContentAtom,
  canSplitSessionPaneAtom,
  closeSessionPaneAtom,
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
  const canSplit = useAtomValue(canSplitSessionPaneAtom);
  const paneCount = useAtomValue(sessionPaneCountAtom);
  const bindFocusedPane = useSetAtom(bindFocusedPaneContentAtom);
  const splitFocusedPane = useSetAtom(splitFocusedPaneAtom);
  const closeSessionPane = useSetAtom(closeSessionPaneAtom);
  const focusSessionPane = useSetAtom(focusSessionPaneAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);

  const afterSplit = () => {
    setActiveSessionId(null);
    setActiveConversationId(null);
  };

  const splitFocusedFromChrome = (direction: SessionSplitDirection) => {
    if (sidebarTab === "chat") {
      bindFocusedPane({
        sessionId: null,
        conversationId: activeConversationId,
      });
    } else {
      bindFocusedPane({
        sessionId: activeSessionId,
        conversationId: null,
      });
    }
    if (!splitFocusedPane(direction)) {
      return;
    }
    afterSplit();
  };

  const splitPaneById = (paneId: string, direction: SessionSplitDirection) => {
    focusSessionPane(paneId);
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

  return {
    canSplit,
    closePane,
    focusedPaneId,
    focusSessionPane,
    paneCount,
    splitFocusedFromChrome,
    splitPaneById,
  };
}

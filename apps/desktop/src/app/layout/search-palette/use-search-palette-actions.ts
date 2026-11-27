import type { SessionRecord } from "@cocurdex/shared";
import { isChatSession, isPersonalSession } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { openDeckAtom } from "@/features/decks";
import { openIssueDetailAtom } from "@/features/issues";
import { openNoteAtom } from "@/features/notes";
import { selectSessionAtom } from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";
import { leaveAppAtom, peekAppViewAtom, selectRailItemAtom } from "../app-rail";
import type { AppView } from "../right-panel-tab-sets";
import { sidebarTabAtom } from "../sidebar";

export function useSearchPaletteActions(
  onClose: () => void,
  placement: "app" | "peek" = "app",
) {
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  const selectRailItem = useSetAtom(selectRailItemAtom);
  const leaveApp = useSetAtom(leaveAppAtom);
  const peekAppView = useSetAtom(peekAppViewAtom);
  const showApp = (view: AppView) => {
    if (placement === "peek") peekAppView(view);
    else selectRailItem(view);
  };
  const openNote = useSetAtom(openNoteAtom);
  const openIssueDetail = useSetAtom(openIssueDetailAtom);
  const openDeck = useSetAtom(openDeckAtom);

  return {
    openSession(session: SessionRecord) {
      onClose();
      leaveApp();
      if (isChatSession(session)) {
        setSidebarTab("chat");
      } else if (isPersonalSession(session)) {
        setSidebarTab("personal");
      } else {
        setSidebarTab("workspaces");
        selectWorkspace(session.workspaceId);
      }
      selectSession(session.id);
    },
    openNote(noteId: string) {
      onClose();
      showApp("notes");
      void openNote(noteId);
    },
    openIssue(issueId: string) {
      onClose();
      showApp("issues");
      void openIssueDetail(issueId);
    },
    openDeck(deckId: string) {
      onClose();
      showApp("decks");
      void openDeck(deckId);
    },
  };
}

import type { SessionRecord } from "@cocurdex/shared";
import { isChatSession, isPersonalSession } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { openDeckAtom } from "@/features/decks";
import { openIssueDetailAtom } from "@/features/issues";
import { openNoteAtom } from "@/features/notes";
import { selectSessionAtom } from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";
import { leaveAppAtom, selectRailItemAtom } from "../app-rail";
import { sidebarTabAtom } from "../sidebar";

export function useSearchPaletteActions(onClose: () => void) {
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  const selectRailItem = useSetAtom(selectRailItemAtom);
  const leaveApp = useSetAtom(leaveAppAtom);
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
      selectRailItem("notes");
      void openNote(noteId);
    },
    openIssue(issueId: string) {
      onClose();
      selectRailItem("issues");
      void openIssueDetail(issueId);
    },
    openDeck(deckId: string) {
      onClose();
      selectRailItem("decks");
      void openDeck(deckId);
    },
  };
}

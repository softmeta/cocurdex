import type { SessionRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { editorPanelOpenAtom } from "@/features/editor";
import { openIssueDetailAtom } from "@/features/issues";
import { openNoteAtom } from "@/features/notes";
import { selectSessionAtom } from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";
import { rightPanelResolvedActiveViewAtom } from "../right-editor-panel-store";
import { sidebarTabAtom } from "../sidebar";

export function useSearchPaletteActions(onClose: () => void) {
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  const setRightPanelView = useSetAtom(rightPanelResolvedActiveViewAtom);
  const setRightPanelOpen = useSetAtom(editorPanelOpenAtom);
  const openNote = useSetAtom(openNoteAtom);
  const openIssueDetail = useSetAtom(openIssueDetailAtom);

  return {
    openSession(session: SessionRecord) {
      onClose();
      setSidebarTab("workspaces");
      selectWorkspace(session.workspaceId);
      selectSession(session.id);
    },
    openNote(noteId: string) {
      onClose();
      setRightPanelView("notes");
      setRightPanelOpen(true);
      void openNote(noteId);
    },
    openIssue(issueId: string) {
      onClose();
      setRightPanelView("issues");
      setRightPanelOpen(true);
      void openIssueDetail(issueId);
    },
  };
}

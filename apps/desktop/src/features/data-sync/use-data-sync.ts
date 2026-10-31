import { useSetAtom } from "jotai";
import { loadDecksAtom } from "@/features/decks/decks-store";
import { refreshIssueDetailAtom } from "@/features/issues/issue-detail-store";
import { refreshIssuesAtom } from "@/features/issues/issues-store";
import { refreshNotesAtom } from "@/features/notes/notes-store";
import { desktopApi, useMountEffect } from "@/lib";

export function useDataSync(area: "issues" | "notes" | "decks") {
  const refreshNotes = useSetAtom(refreshNotesAtom);
  const refreshIssues = useSetAtom(refreshIssuesAtom);
  const refreshIssueDetail = useSetAtom(refreshIssueDetailAtom);
  const loadDecks = useSetAtom(loadDecksAtom);

  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (area === "notes" && event.areas.includes("notes")) {
        void refreshNotes();
      }
      if (area === "decks" && event.areas.includes("decks")) {
        void loadDecks();
      }
      if (area === "issues" && event.areas.includes("issues")) {
        void refreshIssues();
        void refreshIssueDetail();
      }
    }),
  );
}

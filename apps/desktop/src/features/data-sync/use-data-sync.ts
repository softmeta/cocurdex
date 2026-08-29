import { useSetAtom } from "jotai";
import { refreshIssuesAtom } from "@/features/issues/issues-store";
import { refreshNotesAtom } from "@/features/notes/notes-store";
import { desktopApi, useMountEffect } from "@/lib";

export function useDataSync(area: "issues" | "notes") {
  const refreshNotes = useSetAtom(refreshNotesAtom);
  const refreshIssues = useSetAtom(refreshIssuesAtom);

  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (area === "notes" && event.areas.includes("notes")) {
        void refreshNotes();
      }
      if (area === "issues" && event.areas.includes("issues")) {
        void refreshIssues();
      }
    }),
  );
}

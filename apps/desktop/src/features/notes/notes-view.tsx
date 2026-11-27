import { useAtomValue, useSetAtom } from "jotai";
import { NotebookPen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppWorkbench } from "@/app/layout/app-workbench";
import { EmptyState } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { useMountEffect } from "@/lib";
import { NoteEditor } from "./editor";
import {
  activeNoteAtom,
  activeNoteIdAtom,
  loadNotesAtom,
  notesLoadedAtom,
} from "./notes-store";
import { NotesSidebar } from "./sidebar";

const MIN_NOTES_EDITOR_WIDTH_PX = 280;

export function NotesView() {
  const { t } = useTranslation("notes");
  const loadNotes = useSetAtom(loadNotesAtom);
  const loaded = useAtomValue(notesLoadedAtom);

  useMountEffect(() => {
    void loadNotes();
  });

  useDataSync("notes");

  return (
    <AppWorkbench
      app="notes"
      contentMinWidth={MIN_NOTES_EDITOR_WIDTH_PX}
      sidebarResizeLabel={t("sidebar.resize")}
      sidebar={loaded ? <NotesSidebar /> : null}
    >
      {loaded ? <NoteContent /> : null}
    </AppWorkbench>
  );
}

function NoteContent() {
  const { t } = useTranslation("notes");
  const activeNoteId = useAtomValue(activeNoteIdAtom);
  const activeNote = useAtomValue(activeNoteAtom);
  if (activeNoteId && activeNote) return <NoteEditor />;
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<NotebookPen />}
        title={t("editor.empty.title")}
        description={t("editor.empty.description")}
      />
    </div>
  );
}

import { useAtomValue, useSetAtom } from "jotai";
import { NotebookPen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizableSidebar, SidebarCollapsedRail } from "@/components";
import { EmptyState } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { useMountEffect } from "@/lib";
import { NoteEditor } from "./editor";
import {
  activeNoteIdAtom,
  loadNotesAtom,
  notesLoadingAtom,
} from "./notes-store";
import { NotesSidebar } from "./sidebar";

const SIDEBAR_WIDTH_PX = 220;
// Usable note body strip beside the list (mirrors editor min content width).
const MIN_NOTES_EDITOR_WIDTH_PX = 280;
// Sidebar + body; pin / panel resize must not collapse either column.
const MIN_NOTES_VIEW_WIDTH_PX = SIDEBAR_WIDTH_PX + MIN_NOTES_EDITOR_WIDTH_PX;

export function NotesView() {
  const { t } = useTranslation("notes");
  const loadNotes = useSetAtom(loadNotesAtom);
  const activeNoteId = useAtomValue(activeNoteIdAtom);
  const loading = useAtomValue(notesLoadingAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useMountEffect(() => {
    void loadNotes();
  });

  useDataSync("notes");

  if (loading) {
    return null;
  }

  return (
    <div
      className="flex min-h-0 flex-1"
      style={{ minWidth: MIN_NOTES_VIEW_WIDTH_PX }}
    >
      {sidebarCollapsed ? (
        <SidebarCollapsedRail
          onExpand={() => setSidebarCollapsed(false)}
          expandLabel={t("sidebar.expand")}
        />
      ) : (
        <ResizableSidebar
          defaultWidth={SIDEBAR_WIDTH_PX}
          ariaLabel={t("sidebar.resize")}
        >
          <NotesSidebar onCollapse={() => setSidebarCollapsed(true)} />
        </ResizableSidebar>
      )}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas"
        style={{ minWidth: MIN_NOTES_EDITOR_WIDTH_PX }}
      >
        {activeNoteId ? (
          <NoteEditor />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<NotebookPen />}
              title={t("editor.empty.title")}
              description={t("editor.empty.description")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

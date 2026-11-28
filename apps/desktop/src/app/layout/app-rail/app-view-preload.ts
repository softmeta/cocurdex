import { DecksView } from "@/features/decks";
import { IssuesView } from "@/features/issues";
import { MemoryLibraryView } from "@/features/memory";
import { NotesView } from "@/features/notes";
import { RoutinesView } from "@/features/routines";
import { RightEditorPanel } from "../right-editor-panel-lazy";
import type { AppView } from "../right-panel-tab-sets";

const APP_VIEW_CHUNKS: Record<AppView, () => Promise<void>> = {
  issues: IssuesView.preload,
  notes: NotesView.preload,
  decks: DecksView.preload,
  routines: RoutinesView.preload,
  memory: MemoryLibraryView.preload,
};

export function preloadAppChunk(view: AppView): Promise<unknown> {
  return Promise.all([RightEditorPanel.preload(), APP_VIEW_CHUNKS[view]()]);
}

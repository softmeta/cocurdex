import { DecksView } from "@/features/decks";
import { FileTree, GitChanges } from "@/features/editor";
import { IssuesView } from "@/features/issues";
import { MemoryLibraryView } from "@/features/memory";
import { NotesView } from "@/features/notes";
import { RoutinesView } from "@/features/routines";
import { SettingsScreen } from "@/features/settings";
import { TerminalPanel } from "@/features/terminal";
import { RightEditorPanel } from "../right-editor-panel-lazy";
import { SessionListViewMenuContent } from "../sidebar/session-list-view-menu-content-lazy";

const idlePreloads = [
  SessionListViewMenuContent,
  SettingsScreen,
  RightEditorPanel,
  IssuesView,
  NotesView,
  DecksView,
  RoutinesView,
  MemoryLibraryView,
  FileTree,
  GitChanges,
  TerminalPanel,
];

export function preloadScreensWhenIdle(queue = idlePreloads) {
  const [next, ...rest] = queue;
  if (!next) return;
  requestIdleCallback(() => {
    void next.preload().finally(() => preloadScreensWhenIdle(rest));
  });
}

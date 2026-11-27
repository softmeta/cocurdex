import { DecksView, preloadDecks } from "@/features/decks";
import { FileTree, GitChanges } from "@/features/editor";
import { IssuesView, preloadIssues } from "@/features/issues";
import { MemoryLibraryView, preloadMemory } from "@/features/memory";
import { NotesView, preloadNotes } from "@/features/notes";
import { preloadRoutines, RoutinesView } from "@/features/routines";
import { SettingsScreen } from "@/features/settings";
import { TerminalPanel } from "@/features/terminal";
import { RightEditorPanel } from "../right-editor-panel-lazy";
import { SessionListViewMenuContent } from "../sidebar/session-list-view-menu-content-lazy";

type IdleTask = () => Promise<unknown>;

const idleTasks: IdleTask[] = [
  SessionListViewMenuContent.preload,
  SettingsScreen.preload,
  RightEditorPanel.preload,
  IssuesView.preload,
  NotesView.preload,
  DecksView.preload,
  RoutinesView.preload,
  MemoryLibraryView.preload,
  preloadIssues,
  preloadNotes,
  preloadDecks,
  preloadRoutines,
  preloadMemory,
  FileTree.preload,
  GitChanges.preload,
  TerminalPanel.preload,
];

export function preloadScreensWhenIdle(queue = idleTasks) {
  const [next, ...rest] = queue;
  if (!next) return;
  const advance = () => preloadScreensWhenIdle(rest);
  requestIdleCallback(() => {
    void next().then(advance, advance);
  });
}

import { FileTree, GitChanges } from "@/features/editor";
import { SettingsScreen } from "@/features/settings";
import { TerminalPanel } from "@/features/terminal";
import { RightEditorPanel } from "../right-editor-panel-lazy";
import { SessionListViewMenuContent } from "../sidebar/session-list-view-menu-content-lazy";

const idlePreloads = [
  SessionListViewMenuContent,
  SettingsScreen,
  RightEditorPanel,
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

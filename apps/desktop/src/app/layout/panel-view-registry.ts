import {
  AlarmClock,
  Brain,
  FileText,
  FolderTree,
  GitCompare,
  Globe,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  NotebookPen,
  Presentation,
  TerminalSquare,
} from "lucide-react";
import type { RightPanelView } from "./right-panel-tab-sets";

export type PanelViewLabelKey =
  | "actions.showAssistantOverview"
  | "actions.showGitChanges"
  | "actions.showEditor"
  | "actions.showNotes"
  | "actions.showDecks"
  | "actions.showIssues"
  | "actions.showMemory"
  | "actions.showRoutines"
  | "actions.showBrowser"
  | "actions.showPdf"
  | "actions.showTerminal";

export interface PanelViewDef {
  id: RightPanelView;
  icon: LucideIcon;
  labelKey: PanelViewLabelKey;
}

export const PANEL_VIEW_REGISTRY: Record<RightPanelView, PanelViewDef> = {
  overview: {
    id: "overview",
    icon: LayoutDashboard,
    labelKey: "actions.showAssistantOverview",
  },
  git: { id: "git", icon: GitCompare, labelKey: "actions.showGitChanges" },
  editor: { id: "editor", icon: FolderTree, labelKey: "actions.showEditor" },
  notes: { id: "notes", icon: NotebookPen, labelKey: "actions.showNotes" },
  decks: { id: "decks", icon: Presentation, labelKey: "actions.showDecks" },
  issues: { id: "issues", icon: ListTodo, labelKey: "actions.showIssues" },
  memory: { id: "memory", icon: Brain, labelKey: "actions.showMemory" },
  routines: {
    id: "routines",
    icon: AlarmClock,
    labelKey: "actions.showRoutines",
  },
  browser: { id: "browser", icon: Globe, labelKey: "actions.showBrowser" },
  pdf: { id: "pdf", icon: FileText, labelKey: "actions.showPdf" },
  terminal: {
    id: "terminal",
    icon: TerminalSquare,
    labelKey: "actions.showTerminal",
  },
};

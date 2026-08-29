import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { openPdfsAtom } from "@/features/pdf-reader/pdf-reader-store";
import {
  rightPanelHandledRevealClockAtom,
  rightPanelRevealIntentAtom,
} from "./right-panel-reveal";

export type RightPanelView =
  | "editor"
  | "notes"
  | "issues"
  | "git"
  | "browser"
  | "pdf"
  | "terminal";

export const DEFAULT_TAB_ORDER: RightPanelView[] = [
  "editor",
  "git",
  "notes",
  "issues",
  "browser",
  "pdf",
  "terminal",
];

const VALID_VIEWS = new Set<string>(DEFAULT_TAB_ORDER);

function normalizeTabOrder(stored: RightPanelView[]): RightPanelView[] {
  const seen = new Set<string>();
  const result: RightPanelView[] = [];
  for (const id of stored) {
    if (VALID_VIEWS.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of DEFAULT_TAB_ORDER) {
    if (!seen.has(id)) {
      result.push(id);
    }
  }
  return result;
}

export const RIGHT_PANEL_TAB_ORDER_KEY = "cocurdex.right-panel-tab-order";
export const RIGHT_PANEL_ACTIVE_VIEW_KEY = "cocurdex.right-panel-active-view";

const storedTabOrderAtom = atomWithStorage<RightPanelView[]>(
  RIGHT_PANEL_TAB_ORDER_KEY,
  DEFAULT_TAB_ORDER,
  undefined,
  // Sync-read localStorage on first get so cold start does not flash defaults.
  { getOnInit: true },
);

export const rightPanelTabOrderAtom = atom(
  (get) => normalizeTabOrder(get(storedTabOrderAtom)),
  (_get, set, next: RightPanelView[]) => {
    set(storedTabOrderAtom, normalizeTabOrder(next));
  },
);

function normalizeView(value: unknown): RightPanelView {
  if (typeof value === "string" && VALID_VIEWS.has(value)) {
    return value as RightPanelView;
  }
  return "editor";
}

function hasStoredActiveView(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(RIGHT_PANEL_ACTIVE_VIEW_KEY) != null;
  } catch {
    return false;
  }
}

const storedActiveViewAtom = atomWithStorage<RightPanelView>(
  RIGHT_PANEL_ACTIVE_VIEW_KEY,
  "editor",
  undefined,
  // Without getOnInit the atom starts at "editor" and only hydrates after the
  // first subscriber mounts — too late for useState seeds that key off the
  // restored tab (notes/issues/terminal would stay unmounted → blank pane).
  { getOnInit: true },
);

// Survives both in-session remounts (panel collapse / narrow window) and full
// app restarts via localStorage. Invalid legacy values fall back to editor.
export const rightPanelActiveViewAtom = atom(
  (get) => normalizeView(get(storedActiveViewAtom)),
  (_get, set, next: RightPanelView) => {
    set(storedActiveViewAtom, normalizeView(next));
  },
);
// The last non-terminal view, so closing the final terminal can fall back to
// wherever the user was before opening the terminal.
export const rightPanelLastNonTerminalViewAtom = atom<RightPanelView>("editor");
// False until the view is first changed (by the user, a file open, or a prior
// session that already wrote a stored preference). Seeds true when localStorage
// has a value so freezeRightPanelViewAtom does not overwrite a restored tab
// with the first-run editor default on cold start.
export const rightPanelViewTouchedAtom = atom(hasStoredActiveView());
// The terminal is mounted lazily on first activation and then kept alive. This
// flag is persisted so a remount (panel collapse / window-narrow) that restores
// the terminal view re-mounts the terminal instead of leaving a blank pane.
export const rightPanelTerminalEverActiveAtom = atom(false);
// Explorer (file tree) pane width in px. Lives in an atom so a drag-resized
// width survives the panel's collapse/remount cycle like the view atoms above.
export const fileTreeWidthAtom = atom(170);

// Commit the current file-aware default into a real selection and freeze it.
// The active view is otherwise re-derived live from openFiles while untouched,
// so switching to a session with no open files would silently flip the tab
// (editor -> git). Called on every session switch after the session's editor
// view is restored: the first call seeds the default from the just-restored
// files, later calls are no-ops, so the tab stays put across session switches.
// Explicit intent (open file / open pdf) still overrides via the reveal clock.
export const freezeRightPanelViewAtom = atom(null, (get, set) => {
  if (get(rightPanelViewTouchedAtom)) {
    return;
  }

  set(rightPanelActiveViewAtom, "editor");
  set(rightPanelViewTouchedAtom, true);
});

export const rightPanelResolvedActiveViewAtom = atom(
  (get) => {
    const openPdfCount = get(openPdfsAtom).length;

    // Last explicit open (editor file or PDF) wins until the user picks a tab.
    // Never pin an empty PDF surface: closing the last doc must leave the view
    // even if a pdf reveal is still unacknowledged.
    const intent = get(rightPanelRevealIntentAtom);
    if (
      intent !== null &&
      intent.clock !== get(rightPanelHandledRevealClockAtom)
    ) {
      if (intent.view !== "pdf" || openPdfCount > 0) {
        return intent.view;
      }
    }

    const activeView = get(rightPanelActiveViewAtom);
    if (activeView === "pdf" && openPdfCount === 0) {
      // PDF is ephemeral (tab only while docs are open) — never fall back to it.
      const fallback = get(rightPanelLastNonTerminalViewAtom);
      if (fallback === "pdf" || fallback === "terminal") {
        return "editor";
      }
      return fallback;
    }

    if (!get(rightPanelViewTouchedAtom)) {
      return "editor";
    }

    return activeView;
  },
  (get, set, view: RightPanelView) => {
    set(rightPanelActiveViewAtom, view);
    set(rightPanelViewTouchedAtom, true);
    const intent = get(rightPanelRevealIntentAtom);
    if (intent !== null) {
      set(rightPanelHandledRevealClockAtom, intent.clock);
    }
  },
);

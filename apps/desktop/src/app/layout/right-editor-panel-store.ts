import { isPersonalSession } from "@cocurdex/shared";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { openPdfsAtom } from "@/features/pdf-reader/pdf-reader-store";
import { activeSessionIdAtom, sessionsAtom } from "@/features/sessions";
import { desktopApi, type HostCapabilities } from "@/lib";
import {
  rightPanelHandledRevealClockAtom,
  rightPanelRevealIntentAtom,
} from "./right-panel-reveal";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";

export type RightPanelView =
  | "overview"
  | "editor"
  | "notes"
  | "decks"
  | "issues"
  | "memory"
  | "routines"
  | "git"
  | "browser"
  | "pdf"
  | "terminal";

export const DEFAULT_TAB_ORDER: RightPanelView[] = [
  "overview",
  "editor",
  "git",
  "notes",
  "decks",
  "issues",
  "memory",
  "routines",
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

export const rightPanelDockedAtom = atomWithStorage(
  "cocurdex.right-panel-docked",
  false,
  undefined,
  { getOnInit: true },
);

export const RIGHT_PANEL_TAB_ORDER_KEY = "cocurdex.right-panel-tab-order";
export const RIGHT_PANEL_ACTIVE_VIEW_KEY = "cocurdex.right-panel-active-view";

const storedTabOrderAtom = atomWithStorage<RightPanelView[]>(
  RIGHT_PANEL_TAB_ORDER_KEY,
  DEFAULT_TAB_ORDER,
  undefined,
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

export const rightPanelPersonalContextAtom = atom((get) => {
  const sessionId = get(activeSessionIdAtom);
  const session = get(sessionsAtom).find((item) => item.id === sessionId);
  return session
    ? isPersonalSession(session)
    : get(sidebarTabAtom) === "personal";
});

const personalActiveViewAtom = atomWithStorage<RightPanelView>(
  "cocurdex.right-panel-personal-active-view",
  "overview",
  undefined,
  { getOnInit: true },
);

const storedActiveViewAtom = atomWithStorage<RightPanelView>(
  RIGHT_PANEL_ACTIVE_VIEW_KEY,
  "editor",
  undefined,
  { getOnInit: true },
);

export const rightPanelActiveViewAtom = atom(
  (get) =>
    normalizeView(
      get(
        get(rightPanelPersonalContextAtom)
          ? personalActiveViewAtom
          : storedActiveViewAtom,
      ),
    ),
  (get, set, next: RightPanelView) => {
    set(
      get(rightPanelPersonalContextAtom)
        ? personalActiveViewAtom
        : storedActiveViewAtom,
      normalizeView(next),
    );
  },
);
const workLastViewAtom = atom<RightPanelView>("editor");
const personalLastViewAtom = atom<RightPanelView>("overview");
export const rightPanelLastNonTerminalViewAtom = atom(
  (get) =>
    get(
      get(rightPanelPersonalContextAtom)
        ? personalLastViewAtom
        : workLastViewAtom,
    ),
  (get, set, next: RightPanelView) =>
    set(
      get(rightPanelPersonalContextAtom)
        ? personalLastViewAtom
        : workLastViewAtom,
      next,
    ),
);
export const rightPanelViewTouchedAtom = atom(hasStoredActiveView());
export const rightPanelTerminalEverActiveAtom = atom(false);
export const fileTreeWidthAtom = atom(170);

export const freezeRightPanelViewAtom = atom(null, (get, set) => {
  if (get(rightPanelViewTouchedAtom)) {
    return;
  }

  set(
    rightPanelActiveViewAtom,
    get(rightPanelPersonalContextAtom) ? "overview" : "editor",
  );
  set(rightPanelViewTouchedAtom, true);
});

export function isRightPanelViewAvailable(
  view: RightPanelView,
  capabilities: HostCapabilities,
) {
  if (view === "terminal") return capabilities.terminal;
  if (view === "browser") return capabilities.browserView;
  return true;
}

function availableView(
  view: RightPanelView,
  personal: boolean,
): RightPanelView {
  if (personal && (view === "git" || view === "terminal")) return "overview";
  if (!personal && view === "overview") return "editor";
  if (isRightPanelViewAvailable(view, desktopApi.capabilities)) return view;
  return personal ? "overview" : "editor";
}

export const rightPanelResolvedActiveViewAtom = atom(
  (get) => {
    const openPdfCount = get(openPdfsAtom).length;
    const personal = get(rightPanelPersonalContextAtom);

    const intent = get(rightPanelRevealIntentAtom);
    if (
      intent !== null &&
      intent.clock !== get(rightPanelHandledRevealClockAtom)
    ) {
      if (intent.view !== "pdf" || openPdfCount > 0) {
        return availableView(intent.view, personal);
      }
    }

    const activeView = get(rightPanelActiveViewAtom);
    if (activeView === "pdf" && openPdfCount === 0) {
      const fallback = get(rightPanelLastNonTerminalViewAtom);
      if (fallback === "pdf" || fallback === "terminal") {
        return personal ? "overview" : "editor";
      }
      return availableView(fallback, personal);
    }

    if (!personal && !get(rightPanelViewTouchedAtom)) {
      return "editor";
    }

    return availableView(activeView, personal);
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

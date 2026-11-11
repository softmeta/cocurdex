import { isChatSession, isPersonalSession } from "@cocurdex/shared";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { openPdfsAtom } from "@/features/pdf-reader/pdf-reader-store";
import { activeSessionIdAtom, sessionsAtom } from "@/features/sessions";
import { desktopApi, type HostCapabilities } from "@/lib";
import {
  rightPanelHandledRevealClockAtom,
  rightPanelRevealIntentAtom,
} from "./right-panel-reveal";
import {
  isRightPanelViewInMode,
  type RightPanelMode,
  type RightPanelView,
  rightPanelTabSet,
} from "./right-panel-tab-sets";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";

export type { RightPanelView } from "./right-panel-tab-sets";

export const DEFAULT_TAB_ORDER: RightPanelView[] = [
  "editor",
  "git",
  "terminal",
  "issues",
  "notes",
  "browser",
  "decks",
  "memory",
  "routines",
  "overview",
  "pdf",
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

export const rightPanelModeAtom = atom<RightPanelMode>((get) => {
  const sessionId = get(activeSessionIdAtom);
  const session = get(sessionsAtom).find((item) => item.id === sessionId);
  if (session) {
    if (isPersonalSession(session)) return "personal";
    return isChatSession(session) ? "chat" : "work";
  }
  const tab = get(sidebarTabAtom);
  if (tab === "personal") return "personal";
  return tab === "chat" ? "chat" : "work";
});

export const rightPanelPersonalContextAtom = atom(
  (get) => get(rightPanelModeAtom) === "personal",
);

const personalActiveViewAtom = atomWithStorage<RightPanelView>(
  "cocurdex.right-panel-personal-active-view",
  "overview",
  undefined,
  { getOnInit: true },
);

const chatActiveViewAtom = atomWithStorage<RightPanelView>(
  "cocurdex.right-panel-chat-active-view",
  "notes",
  undefined,
  { getOnInit: true },
);

const storedActiveViewAtom = atomWithStorage<RightPanelView>(
  RIGHT_PANEL_ACTIVE_VIEW_KEY,
  "editor",
  undefined,
  { getOnInit: true },
);

const ACTIVE_VIEW_ATOMS = {
  work: storedActiveViewAtom,
  chat: chatActiveViewAtom,
  personal: personalActiveViewAtom,
} satisfies Record<RightPanelMode, unknown>;

export const rightPanelActiveViewAtom = atom(
  (get) => normalizeView(get(ACTIVE_VIEW_ATOMS[get(rightPanelModeAtom)])),
  (get, set, next: RightPanelView) => {
    set(ACTIVE_VIEW_ATOMS[get(rightPanelModeAtom)], normalizeView(next));
  },
);

const LAST_VIEW_ATOMS = {
  work: atom<RightPanelView>("editor"),
  chat: atom<RightPanelView>("notes"),
  personal: atom<RightPanelView>("overview"),
} satisfies Record<RightPanelMode, unknown>;

export const rightPanelLastNonTerminalViewAtom = atom(
  (get) => get(LAST_VIEW_ATOMS[get(rightPanelModeAtom)]),
  (get, set, next: RightPanelView) =>
    set(LAST_VIEW_ATOMS[get(rightPanelModeAtom)], next),
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
    rightPanelTabSet(get(rightPanelModeAtom)).fallback,
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
  mode: RightPanelMode,
): RightPanelView {
  if (
    isRightPanelViewInMode(view, mode) &&
    isRightPanelViewAvailable(view, desktopApi.capabilities)
  ) {
    return view;
  }
  return rightPanelTabSet(mode).fallback;
}

export const rightPanelResolvedActiveViewAtom = atom(
  (get) => {
    const openPdfCount = get(openPdfsAtom).length;
    const mode = get(rightPanelModeAtom);
    const fallbackView = rightPanelTabSet(mode).fallback;

    const intent = get(rightPanelRevealIntentAtom);
    if (
      intent !== null &&
      intent.clock !== get(rightPanelHandledRevealClockAtom)
    ) {
      if (intent.view !== "pdf" || openPdfCount > 0) {
        return availableView(intent.view, mode);
      }
    }

    const activeView = get(rightPanelActiveViewAtom);
    if (activeView === "pdf" && openPdfCount === 0) {
      const fallback = get(rightPanelLastNonTerminalViewAtom);
      if (fallback === "pdf" || fallback === "terminal") {
        return fallbackView;
      }
      return availableView(fallback, mode);
    }

    if (mode !== "personal" && !get(rightPanelViewTouchedAtom)) {
      return fallbackView;
    }

    return availableView(activeView, mode);
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

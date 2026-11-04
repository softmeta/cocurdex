import { isChatSession } from "@cocurdex/shared";
import { atom, type createStore, type Getter, type Setter } from "jotai";
import { activeDeckIdAtom, openDeckAtom } from "@/features/decks";
import { editorPanelOpenAtom } from "@/features/editor";
import {
  closeIssueDetailAtom,
  issueDetailIdAtom,
  openIssueDetailAtom,
} from "@/features/issues";
import { activeNoteIdAtom, openNoteAtom } from "@/features/notes";
import {
  activeSessionIdAtom,
  selectSessionAtom,
  sessionsAtom,
} from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";
import {
  type RightPanelView,
  rightPanelResolvedActiveViewAtom,
} from "../right-editor-panel-store";
import { sidebarTabAtom } from "../sidebar";
import {
  type AppLocation,
  currentLocation,
  EMPTY_HISTORY,
  type NavigationDirection,
  type NavigationHistory,
  type PanelLocation,
  panelLocationsEqual,
  recordLocation,
  replaceCurrentLocation,
  stepHistory,
} from "./navigation-history";

export const navigationHistoryAtom = atom<NavigationHistory>(EMPTY_HISTORY);
const navigationApplyingAtom = atom(false);

function panelEntityId(get: Getter, view: RightPanelView): string | null {
  if (view === "notes") return get(activeNoteIdAtom);
  if (view === "issues") return get(issueDetailIdAtom);
  if (view === "decks") return get(activeDeckIdAtom);
  return null;
}

export const currentAppLocationAtom = atom((get): AppLocation => {
  const view = get(rightPanelResolvedActiveViewAtom);
  return {
    sessionId: get(activeSessionIdAtom),
    panel: { view, entityId: panelEntityId(get, view) },
  };
});

const settleNavigationAtom = atom(null, (get, set) => {
  const location = get(currentAppLocationAtom);
  const history = get(navigationHistoryAtom);
  if (get(navigationApplyingAtom)) {
    set(navigationApplyingAtom, false);
    set(navigationHistoryAtom, replaceCurrentLocation(history, location));
    return;
  }
  set(navigationHistoryAtom, recordLocation(history, location));
});

function applySession(get: Getter, set: Setter, sessionId: string | null) {
  if (sessionId === get(activeSessionIdAtom)) return;
  if (sessionId === null) {
    set(selectSessionAtom, null);
    return;
  }
  const session = get(sessionsAtom).find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) return;
  if (isChatSession(session)) {
    set(sidebarTabAtom, "chat");
  } else {
    set(sidebarTabAtom, "workspaces");
    set(selectWorkspaceAtom, session.workspaceId);
  }
  set(selectSessionAtom, session.id);
}

function applyPanelEntity(set: Setter, panel: PanelLocation) {
  const { view, entityId } = panel;
  if (view === "issues") {
    if (entityId) void set(openIssueDetailAtom, entityId);
    else set(closeIssueDetailAtom);
    return;
  }
  if (!entityId) return;
  if (view === "notes") void set(openNoteAtom, entityId);
  if (view === "decks") void set(openDeckAtom, entityId);
}

function applyPanel(get: Getter, set: Setter, panel: PanelLocation) {
  if (panelLocationsEqual(panel, get(currentAppLocationAtom).panel)) return;
  set(editorPanelOpenAtom, true);
  set(rightPanelResolvedActiveViewAtom, panel.view);
  applyPanelEntity(set, panel);
}

export const navigateAtom = atom(
  null,
  (get, set, direction: NavigationDirection) => {
    const next = stepHistory(get(navigationHistoryAtom), direction);
    const target = next ? currentLocation(next) : null;
    if (!next || !target) return;
    set(navigationHistoryAtom, next);
    set(navigationApplyingAtom, true);
    applySession(get, set, target.sessionId);
    applyPanel(get, set, target.panel);
  },
);

const NAVIGATION_SETTLE_MS = 150;

export function subscribeNavigationRecorder(
  store: ReturnType<typeof createStore>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => store.set(settleNavigationAtom),
      NAVIGATION_SETTLE_MS,
    );
  };
  const unsubscribers = [
    store.sub(currentAppLocationAtom, schedule),
    store.sub(navigationApplyingAtom, schedule),
  ];
  schedule();
  return () => {
    clearTimeout(timer);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

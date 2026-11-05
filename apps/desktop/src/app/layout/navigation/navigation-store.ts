import { isChatSession, isPersonalSession } from "@cocurdex/shared";
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
  appScreenAtom,
  settingsSectionAtom,
} from "../app-shell/app-screen-store";
import {
  type RightPanelView,
  rightPanelResolvedActiveViewAtom,
} from "../right-editor-panel-store";
import { sidebarTabAtom } from "../sidebar";
import {
  type AppLocation,
  currentLocation,
  EMPTY_HISTORY,
  locationsEqual,
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
const navigationEpochAtom = atom(0);
export const navigationPendingAtom = atom(false);

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
    settings:
      get(appScreenAtom) === "settings" ? get(settingsSectionAtom) : null,
  };
});

function settleNavigation(get: Getter, set: Setter) {
  set(navigationPendingAtom, false);
  const location = get(currentAppLocationAtom);
  const history = get(navigationHistoryAtom);
  if (get(navigationApplyingAtom)) {
    set(navigationApplyingAtom, false);
    set(navigationHistoryAtom, replaceCurrentLocation(history, location));
    return;
  }
  set(navigationHistoryAtom, recordLocation(history, location));
}

const settleNavigationAtom = atom(null, settleNavigation);

function finishApplyingWhenArrived(get: Getter, set: Setter) {
  if (!get(navigationApplyingAtom)) return;
  const target = currentLocation(get(navigationHistoryAtom));
  if (target && locationsEqual(target, get(currentAppLocationAtom))) {
    set(navigationApplyingAtom, false);
  }
}

const finishApplyingWhenArrivedAtom = atom(null, finishApplyingWhenArrived);

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
  } else if (isPersonalSession(session)) {
    set(sidebarTabAtom, "personal");
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
    settleNavigation(get, set);
    const next = stepHistory(get(navigationHistoryAtom), direction);
    const target = next ? currentLocation(next) : null;
    if (!next || !target) return;
    set(navigationHistoryAtom, next);
    set(navigationApplyingAtom, true);
    set(navigationEpochAtom, get(navigationEpochAtom) + 1);
    applySession(get, set, target.sessionId);
    applyPanel(get, set, target.panel);
    if (target.settings) set(settingsSectionAtom, target.settings);
    set(appScreenAtom, target.settings ? "settings" : "app");
    finishApplyingWhenArrived(get, set);
  },
);

const NAVIGATION_SETTLE_MS = 150;

export function subscribeNavigationRecorder(
  store: ReturnType<typeof createStore>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    store.set(finishApplyingWhenArrivedAtom);
    store.set(navigationPendingAtom, true);
    clearTimeout(timer);
    timer = setTimeout(
      () => store.set(settleNavigationAtom),
      NAVIGATION_SETTLE_MS,
    );
  };
  const unsubscribers = [
    store.sub(currentAppLocationAtom, schedule),
    store.sub(navigationEpochAtom, schedule),
  ];
  schedule();
  return () => {
    clearTimeout(timer);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

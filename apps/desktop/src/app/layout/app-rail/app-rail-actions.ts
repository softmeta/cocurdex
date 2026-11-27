import { atom } from "jotai";
import { editorPanelOpenAtom } from "@/features/editor";
import {
  rightPanelModeAtom,
  rightPanelResolvedActiveViewAtom,
} from "../right-editor-panel-store";
import {
  rightPanelHandledRevealClockAtom,
  rightPanelRevealIntentAtom,
} from "../right-panel-reveal";
import { type AppView, isRightPanelViewInMode } from "../right-panel-tab-sets";
import {
  type SidebarTab,
  sidebarTabAtom,
  switchSidebarTabAtom,
} from "../sidebar/sidebar-tab-store";
import { activeAppAtom } from "./app-rail-store";

export type RailItem = SidebarTab | AppView;

const SIDEBAR_TABS: readonly RailItem[] = ["personal", "workspaces", "chat"];

function isSidebarTab(item: RailItem): item is SidebarTab {
  return SIDEBAR_TABS.includes(item);
}

export const railSelectionAtom = atom<RailItem>(
  (get) => get(activeAppAtom) ?? get(sidebarTabAtom),
);

export const selectRailItemAtom = atom(null, (get, set, item: RailItem) => {
  if (isSidebarTab(item)) {
    set(activeAppAtom, null);
    set(switchSidebarTabAtom, item);
    return;
  }
  set(activeAppAtom, item);
  const intent = get(rightPanelRevealIntentAtom);
  if (intent !== null) set(rightPanelHandledRevealClockAtom, intent.clock);
});

export const leaveAppAtom = atom(null, (_get, set) => {
  set(activeAppAtom, null);
});

export const peekAppViewAtom = atom(null, (get, set, view: AppView) => {
  const mode = get(rightPanelModeAtom);
  if (mode === "app" || !isRightPanelViewInMode(view, mode)) {
    set(selectRailItemAtom, view);
    return;
  }
  set(rightPanelResolvedActiveViewAtom, view);
  set(editorPanelOpenAtom, true);
});

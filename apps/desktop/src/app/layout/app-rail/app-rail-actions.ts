import { atom } from "jotai";
import type { AppView } from "../right-panel-tab-sets";
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

export const selectRailItemAtom = atom(null, (_get, set, item: RailItem) => {
  if (isSidebarTab(item)) {
    set(activeAppAtom, null);
    set(switchSidebarTabAtom, item);
    return;
  }
  set(activeAppAtom, item);
});

export const leaveAppAtom = atom(null, (_get, set) => {
  set(activeAppAtom, null);
});

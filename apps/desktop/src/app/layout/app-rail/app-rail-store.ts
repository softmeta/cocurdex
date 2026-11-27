import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { ChatDockVisibility } from "../chat-dock-geometry";
import { APP_VIEWS, type AppView } from "../right-panel-tab-sets";

export const activeAppAtom = atom<AppView | null>(null);

export const appDockPinnedAtom = atomWithStorage(
  "cocurdex.app-rail.dock-pinned",
  true,
  undefined,
  { getOnInit: true },
);

export const appDockVisibilityAtom = atomWithStorage<ChatDockVisibility>(
  "cocurdex.app-rail.dock-visibility",
  "open",
  undefined,
  { getOnInit: true },
);

const pinnedAppsStorageAtom = atomWithStorage<readonly AppView[]>(
  "cocurdex.app-rail.pinned-apps",
  ["issues", "notes"],
  undefined,
  { getOnInit: true },
);

export const railPinnedAppsAtom = atom((get) => {
  const pinned = new Set(get(pinnedAppsStorageAtom));
  return APP_VIEWS.filter((app) => pinned.has(app));
});

export const setRailAppPinnedAtom = atom(
  null,
  (get, set, { app, pinned }: { app: AppView; pinned: boolean }) => {
    const others = get(pinnedAppsStorageAtom).filter((item) => item !== app);
    set(pinnedAppsStorageAtom, pinned ? [...others, app] : others);
  },
);

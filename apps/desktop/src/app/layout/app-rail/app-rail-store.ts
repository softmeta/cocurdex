import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { ChatDockVisibility } from "../chat-dock-geometry";
import type { AppView } from "../right-panel-tab-sets";

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

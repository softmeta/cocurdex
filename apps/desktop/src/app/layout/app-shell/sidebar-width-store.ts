import { atom } from "jotai";
import { getStoredLeftWidth } from "../chat-layout-preference";
import { MAX_LEFT, MIN_LEFT } from "./app-shell-layout";

export const DEFAULT_LEFT = 240;

export function clampSidebarWidth(width: number) {
  return Math.min(MAX_LEFT, Math.max(MIN_LEFT, width));
}

export const windowSidebarWidthAtom = atom(
  clampSidebarWidth(getStoredLeftWidth() ?? DEFAULT_LEFT),
);

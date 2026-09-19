import { atom } from "jotai";
import type { ChatWindowState } from "@/lib/chat-window-types";

export const chatWindowStateAtom = atom<ChatWindowState>({
  detached: false,
  transitioning: false,
});
export const chatWindowBusyAtom = atom(false);
export const isDetachedChatWindow =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("window") === "chat";

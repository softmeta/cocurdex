import { useSyncExternalStore } from "react";
import { dockAreaWidth } from "./chat-dock-geometry";

function subscribe(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

export function useChatDockViewportWidth() {
  return useSyncExternalStore(subscribe, dockAreaWidth, () => 0);
}

import { useStore } from "jotai";
import { useAppShortcuts } from "@/features/shortcuts";
import { useMountEffect } from "@/lib";
import type { NavigationDirection } from "./navigation-history";
import { navigateAtom, subscribeNavigationRecorder } from "./navigation-store";

const MOUSE_BUTTON_DIRECTIONS: Partial<Record<number, NavigationDirection>> = {
  3: "back",
  4: "forward",
};

export function useAppNavigation() {
  const store = useStore();
  const navigate = (direction: NavigationDirection) =>
    store.set(navigateAtom, direction);

  useMountEffect(() => subscribeNavigationRecorder(store));

  useMountEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      const direction = MOUSE_BUTTON_DIRECTIONS[event.button];
      if (!direction) return;
      event.preventDefault();
      store.set(navigateAtom, direction);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  });

  useAppShortcuts({
    navigateBack: () => navigate("back"),
    navigateForward: () => navigate("forward"),
  });
}

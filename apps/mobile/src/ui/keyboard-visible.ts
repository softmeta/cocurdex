import { useSyncExternalStore } from "react";
import { Keyboard } from "react-native";

function subscribe(listener: () => void) {
  const shown = Keyboard.addListener("keyboardDidShow", listener);
  const hidden = Keyboard.addListener("keyboardDidHide", listener);
  return () => {
    shown.remove();
    hidden.remove();
  };
}

export function useKeyboardVisible() {
  return useSyncExternalStore(subscribe, () => Keyboard.isVisible());
}

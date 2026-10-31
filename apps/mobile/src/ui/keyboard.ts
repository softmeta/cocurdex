import { Keyboard } from "react-native";

export function keyboardHidden() {
  if (!Keyboard.isVisible()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      subscription.remove();
      resolve();
    });
  });
}

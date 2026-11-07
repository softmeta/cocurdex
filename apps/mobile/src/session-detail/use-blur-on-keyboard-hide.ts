import { type ComponentRef, type RefObject, useEffect } from "react";
import { Keyboard, Platform, type TextInput } from "react-native";

export type TextInputHandle = ComponentRef<typeof TextInput>;

export function useBlurOnKeyboardHide(
  input: RefObject<TextInputHandle | null>,
) {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      input.current?.blur();
    });
    return () => hidden.remove();
  }, [input]);
}

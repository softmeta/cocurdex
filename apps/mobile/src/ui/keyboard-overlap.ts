import { useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
} from "react-native";

const SHOW_EVENT =
  Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
const HIDE_EVENT =
  Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

function animate(event: KeyboardEvent) {
  if (Platform.OS !== "ios" || !event.duration) return;
  LayoutAnimation.configureNext({
    duration: event.duration,
    update: { duration: event.duration, type: "keyboard" },
  });
}

function keyboardOverlap(windowHeight: number, keyboardTop: number) {
  return Math.max(windowHeight - keyboardTop, 0);
}

export function useBottomKeyboardOverlap() {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (event) => {
      animate(event);
      setOverlap(
        keyboardOverlap(
          Dimensions.get("window").height,
          event.endCoordinates.screenY,
        ),
      );
    });
    const hide = Keyboard.addListener(HIDE_EVENT, (event) => {
      animate(event);
      setOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return overlap;
}

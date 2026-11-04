import { useHeaderHeight } from "expo-router/react-navigation";
import { type ComponentRef, useRef, useState } from "react";
import type { View } from "react-native";

export function useHeaderOverlap() {
  const headerHeight = useHeaderHeight();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [top, setTop] = useState<number | null>(null);
  const onLayout = () =>
    ref.current?.measureInWindow((_x, y) => setTop(Math.round(y)));
  const windowTop = top ?? headerHeight;
  return {
    overlap: Math.max(0, Math.round(headerHeight - windowTop)),
    windowTop,
    ref,
    onLayout,
  };
}

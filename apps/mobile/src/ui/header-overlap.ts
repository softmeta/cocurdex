import { useHeaderHeight } from "expo-router/react-navigation";
import { type ComponentRef, useRef, useState } from "react";
import type { View } from "react-native";

export function useHeaderOverlap() {
  const headerHeight = useHeaderHeight();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [overlap, setOverlap] = useState(0);
  const onLayout = () =>
    ref.current?.measureInWindow((_x, y) =>
      setOverlap(Math.max(0, Math.round(headerHeight - y))),
    );
  return { overlap, ref, onLayout };
}

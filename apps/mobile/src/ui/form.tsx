import { useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGroupedColors, useSurface } from "@/theme";
import { formMetrics } from "./form-metrics";
import type { FormProps } from "./form-props";
import { useTabBarInset } from "./tab-bar-inset";

function useBottomClearance() {
  const safeBottom = useSafeAreaInsets().bottom;
  const tabBarInset = useTabBarInset();
  // iOS adds the safe area through contentInsetAdjustmentBehavior; Android
  // draws edge to edge, so the content itself must clear the navigation bar.
  const systemInset = Platform.OS === "ios" ? safeBottom : 0;
  return Math.max(tabBarInset, safeBottom) - systemInset;
}

// Material's BottomSheetBehavior leaves a touch on the sheet's scrolling child
// to nested scrolling, and a ScrollView whose content fits never starts one, so
// dragging such a list could not expand the sheet from its lower detent.
// Keeping the content one pixel taller than the viewport lets every drag reach
// the sheet. https://github.com/software-mansion/react-native-screens/issues/4994
function useSheetDragFloor() {
  const [viewportHeight, setViewportHeight] = useState(0);
  const surface = useSurface();
  const enabled = Platform.OS === "android" && surface === "sheet";
  const onLayout = (event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  };
  if (!enabled) return { minHeight: undefined, onLayout: undefined };
  return {
    minHeight: viewportHeight > 0 ? viewportHeight + 1 : undefined,
    onLayout,
  };
}

export function Form({ children, adjustsForKeyboard = false }: FormProps) {
  const grouped = useGroupedColors();
  const bottomClearance = useBottomClearance();
  const dragFloor = useSheetDragFloor();
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: grouped.page }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: formMetrics.pagePadding + bottomClearance,
          minHeight: dragFloor.minHeight,
        },
      ]}
      onLayout={dragFloor.onLayout}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets={adjustsForKeyboard}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: formMetrics.pagePadding,
    gap: formMetrics.sectionGap,
  },
});

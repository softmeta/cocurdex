import { StyleSheet, View } from "react-native";
import { useGroupedColors, useThemeColors } from "./colors";

export function SheetGrabber() {
  const colors = useThemeColors();
  const grouped = useGroupedColors();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.area, { backgroundColor: grouped.page }]}
    >
      <View
        style={[styles.handle, { backgroundColor: colors.mutedForeground }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  area: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handle: { width: 32, height: 4, borderRadius: 2, opacity: 0.4 },
});

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useGroupedColors, useThemeColors } from "@/theme";
import { formMetrics } from "./form-metrics";

export function FormCell({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const grouped = useGroupedColors();
  return (
    <View style={[styles.cell, { backgroundColor: grouped.cell }]}>
      {children}
      {formMetrics.separator ? (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { borderRadius: formMetrics.innerRadius, overflow: "hidden" },
  separator: {
    position: "absolute",
    left: formMetrics.pagePadding,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});

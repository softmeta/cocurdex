import type { ComponentProps } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useThemeColors } from "@/theme";
import { formMetrics } from "./form-metrics";

export function FormTextField({
  ref,
  style,
  ...props
}: ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.mutedForeground}
      selectionColor={colors.tint}
      cursorColor={colors.tint}
      {...props}
      style={[styles.field, { color: colors.foreground }, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: formMetrics.rowMinHeight,
    fontSize: formMetrics.bodySize,
    paddingHorizontal: formMetrics.pagePadding,
    paddingVertical: formMetrics.rowPaddingVertical,
  },
});

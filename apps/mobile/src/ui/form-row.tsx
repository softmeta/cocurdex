import { Pressable, StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";
import { FormCell } from "./form-cell";
import { formMetrics } from "./form-metrics";
import type { FormRowProps } from "./form-props";
import { FormSupportingText, FormText } from "./form-text";

export function FormRow({
  children,
  supporting,
  leading,
  trailing,
  testID,
  disabled,
  selected,
  onPress,
}: FormRowProps) {
  const colors = useThemeColors();
  const pressable = onPress !== undefined && !disabled;
  return (
    <FormCell>
      <Pressable
        testID={testID}
        accessibilityRole={pressable ? "button" : undefined}
        accessibilityState={selected === undefined ? undefined : { selected }}
        disabled={!pressable}
        onPress={onPress}
        android_ripple={pressable ? { color: colors.muted } : undefined}
        style={({ pressed }) => [
          styles.row,
          pressed && formMetrics.separator
            ? { backgroundColor: colors.muted }
            : null,
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.content}>
          {typeof children === "string" ? (
            <FormText>{children}</FormText>
          ) : (
            children
          )}
          {typeof supporting === "string" ? (
            <FormSupportingText>{supporting}</FormSupportingText>
          ) : (
            supporting
          )}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>
    </FormCell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: formMetrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: formMetrics.pagePadding,
    paddingVertical: formMetrics.rowPaddingVertical,
  },
  leading: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, minWidth: 0 },
  trailing: { flexShrink: 1, maxWidth: "60%", alignItems: "flex-end" },
});

import { Pressable, StyleSheet, Text } from "react-native";
import { control, space, useThemeColors } from "@/theme";

export type ActionButtonVariant = "primary" | "secondary" | "destructive";

export function ActionButton({
  label,
  variant = "secondary",
  disabled = false,
  grow = false,
  onPress,
}: {
  label: string;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  grow?: boolean;
  onPress(): void;
}) {
  const colors = useThemeColors();
  const palette = {
    primary: { background: colors.foreground, text: colors.background },
    secondary: { background: colors.muted, text: colors.foreground },
    destructive: { background: colors.muted, text: colors.destructive },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        grow && styles.grow,
        { backgroundColor: palette.background },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: control.standard.height,
    borderRadius: control.standard.radius,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flexGrow: 1, flexBasis: 0 },
  label: { fontSize: 15, fontWeight: "500" },
  dimmed: { opacity: 0.5 },
});

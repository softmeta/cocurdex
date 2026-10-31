import { StyleSheet, type ViewStyle } from "react-native";
import { useThemeColors, useThemeName } from "@/theme";

const SHADOW = {
  light: "0 4px 16px rgba(0, 0, 0, 0.10)",
  dark: "0 4px 16px rgba(0, 0, 0, 0.40)",
} as const;

export function useFloatingSurface(): ViewStyle {
  const colors = useThemeColors();
  const scheme = useThemeName();
  return {
    backgroundColor: colors.popover,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: SHADOW[scheme],
  };
}

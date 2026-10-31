import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { type ThemeName, themeColors, useThemeName } from "@/theme";

const TONAL_FILL = {
  light: "rgba(0, 0, 0, 0.06)",
  dark: "rgba(255, 255, 255, 0.10)",
} as const;

const SIZE = 44;

export function CircleButton({
  icon,
  label,
  onPress,
  badge = false,
  disabled = false,
  tonal = false,
  scheme: forcedScheme,
  testID,
}: {
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
  onPress(): void;
  badge?: boolean;
  disabled?: boolean;
  tonal?: boolean;
  scheme?: ThemeName;
  testID?: string;
}) {
  const themeScheme = useThemeName();
  const scheme = forcedScheme ?? themeScheme;
  const colors = themeColors[scheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tonal && { backgroundColor: TONAL_FILL[scheme] },
        pressed && { opacity: 0.7 },
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      <SymbolView name={icon} size={22} tintColor={colors.foreground} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.tint }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  badge: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type ThemeName, themeColors, useThemeName } from "@/theme";

const TONAL_FILL = {
  light: "rgba(0, 0, 0, 0.06)",
  dark: "rgba(255, 255, 255, 0.10)",
} as const;

const SIZE = 44;

function BadgeMark({
  badge,
  tint,
  foreground,
}: {
  badge: boolean | number;
  tint: string;
  foreground: string;
}) {
  if (typeof badge === "number") {
    if (badge <= 0) return null;
    return (
      <View style={[styles.countBadge, { backgroundColor: tint }]}>
        <Text style={[styles.countText, { color: foreground }]}>{badge}</Text>
      </View>
    );
  }
  return badge ? (
    <View style={[styles.badge, { backgroundColor: tint }]} />
  ) : null;
}

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
  badge?: boolean | number;
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
      accessibilityLabel={
        typeof badge === "number" && badge > 0 ? `${label}, ${badge}` : label
      }
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
      <BadgeMark
        badge={badge}
        tint={colors.tint}
        foreground={colors.background}
      />
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
  countBadge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
});

import type { TabTriggerSlotProps } from "expo-router/ui";
import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useThemeColors } from "@/theme";
import { useFloatingSurface } from "@/ui";

const TAB_WIDTH = 64;
const TAB_HEIGHT = 48;
const BAR_PADDING = 6;
const BAR_GAP = space.md;

export const FLOATING_TAB_BAR_HEIGHT = TAB_HEIGHT + BAR_PADDING * 2;

export function useFloatingTabBarInset() {
  return FLOATING_TAB_BAR_HEIGHT + BAR_GAP * 2 + useSafeAreaInsets().bottom;
}

export function FloatingTabBar({
  hidden,
  children,
  style,
  ...props
}: ViewProps & { hidden: boolean; children?: ReactNode }) {
  const surface = useFloatingSurface();
  const bottom = useSafeAreaInsets().bottom + BAR_GAP;
  return (
    <View
      {...props}
      accessibilityRole="tablist"
      style={[style, styles.bar, surface, { bottom }, hidden && styles.hidden]}
    >
      {children}
    </View>
  );
}

export function FloatingTab({
  icon,
  label,
  isFocused,
  style,
  ref,
  ...props
}: TabTriggerSlotProps & {
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      android_ripple={{ color: colors.muted, borderless: true }}
      style={[styles.tab, isFocused && { backgroundColor: colors.muted }]}
    >
      <SymbolView
        name={icon}
        size={24}
        tintColor={isFocused ? colors.foreground : colors.mutedForeground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    padding: BAR_PADDING,
    gap: space.xs,
    borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
  },
  hidden: { display: "none" },
  tab: {
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: TAB_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});

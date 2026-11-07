import type { TabTriggerSlotProps } from "expo-router/ui";
import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import type { ReactNode, Ref } from "react";
import {
  type HostInstance,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useThemeColors } from "@/theme";
import { useFloatingSurface } from "@/ui";

const TAB_WIDTH = 52;
const TAB_HEIGHT = 48;
const BAR_PADDING = 6;
const BAR_GAP = space.md;

export const FLOATING_TAB_BAR_HEIGHT = TAB_HEIGHT + BAR_PADDING * 2;

function useBarBottom() {
  return Math.max(useSafeAreaInsets().bottom - space.sm, BAR_GAP);
}

export function useFloatingTabBarInset() {
  return FLOATING_TAB_BAR_HEIGHT + BAR_GAP + useBarBottom();
}

export function FloatingTabBar({
  hidden,
  children,
  style,
  ...props
}: ViewProps & { hidden: boolean; children?: ReactNode }) {
  const surface = useFloatingSurface();
  const bottom = useBarBottom();
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
  modeSwitch = false,
  style,
  ref,
  ...props
}: Omit<TabTriggerSlotProps, "ref"> & {
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
  modeSwitch?: boolean;
  ref?: Ref<HostInstance>;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityRole={modeSwitch ? "button" : "tab"}
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
      {modeSwitch ? (
        <SymbolView
          name={{ ios: "chevron.up.chevron.down", android: "unfold_more" }}
          size={10}
          tintColor={colors.mutedForeground}
          style={styles.modeIndicator}
        />
      ) : null}
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
  modeIndicator: { position: "absolute", right: 3 },
});

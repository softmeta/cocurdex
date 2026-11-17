import { Pressable, StyleSheet, Text } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { EdgeFadeScrollRow } from "./edge-fade-scroll-row";

const CHIP_HIT_SLOP = { top: 6, bottom: 6 };

export interface CapsuleTab {
  key: string;
  label: string;
  count?: number;
}

function Capsule({
  tab,
  selected,
  testID,
  onPress,
}: {
  tab: CapsuleTab;
  selected: boolean;
  testID: string;
  onPress(): void;
}) {
  const colors = useThemeColors();
  const background = selected ? colors.foreground : colors.muted;
  const foreground = selected ? colors.background : colors.foreground;
  const supporting = selected ? colors.background : colors.mutedForeground;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={
        tab.count === undefined ? tab.label : `${tab.label}, ${tab.count}`
      }
      hitSlop={CHIP_HIT_SLOP}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: background },
        pressed && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: foreground }]}>
        {tab.label}
      </Text>
      {tab.count === undefined ? null : (
        <Text style={[styles.count, { color: supporting }]}>{tab.count}</Text>
      )}
    </Pressable>
  );
}

export function CapsuleTabs({
  tabs,
  selectedKey,
  onSelect,
  testID,
}: {
  tabs: readonly CapsuleTab[];
  selectedKey: string;
  onSelect(key: string): void;
  testID: string;
}) {
  return (
    <EdgeFadeScrollRow
      accessibilityRole="tablist"
      style={styles.bar}
      contentContainerStyle={styles.chips}
      testID={testID}
    >
      {tabs.map((tab) => (
        <Capsule
          key={tab.key}
          tab={tab}
          selected={tab.key === selectedKey}
          testID={`${testID}-${tab.key}`}
          onPress={() => onSelect(tab.key)}
        />
      ))}
    </EdgeFadeScrollRow>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  chips: {
    gap: space.sm,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.sm,
  },
  chip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: 999,
  },
  pressed: { opacity: 0.7 },
  label: { fontSize: 14, maxWidth: 200 },
  count: { fontSize: 13, fontVariant: ["tabular-nums"] },
});

import { SymbolView } from "expo-symbols";
import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";

const BAR_LEVELS: Record<string, number> = { high: 3, medium: 2, low: 1 };
const BAR_HEIGHTS = [6, 10, 14];
const FADED = 0.3;

export function IssuePriorityMark({
  priority,
  label,
}: {
  priority: string;
  label: string;
}) {
  const colors = useThemeColors();
  if (priority === "urgent") {
    return (
      <SymbolView
        accessibilityLabel={label}
        name={{ ios: "exclamationmark.square.fill", android: "priority_high" }}
        size={14}
        tintColor={colors.mutedForeground}
      />
    );
  }
  const level = BAR_LEVELS[priority];
  if (level === undefined) {
    return (
      <SymbolView
        accessibilityLabel={label}
        name={{ ios: "ellipsis", android: "more_horiz" }}
        size={14}
        tintColor={colors.mutedForeground}
      />
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={styles.bars}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={height}
          style={[
            styles.bar,
            {
              height,
              backgroundColor: colors.mutedForeground,
              opacity: index < level ? 1 : FADED,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: {
    width: 14,
    height: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  bar: { width: 3, borderRadius: 1 },
});

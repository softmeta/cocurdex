import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { EdgeFadeScrollRow } from "@/ui";

const CHIP_HIT_SLOP = { top: 6, bottom: 6 };

export interface SessionGroupChip {
  key: string;
  label: string;
  count: number;
}

function Chip({
  label,
  count,
  selected,
  testID,
  onPress,
}: {
  label: string;
  count: number | null;
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
      accessibilityLabel={count === null ? label : `${label}, ${count}`}
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
        {label}
      </Text>
      {count === null ? null : (
        <Text style={[styles.count, { color: supporting }]}>{count}</Text>
      )}
    </Pressable>
  );
}

export function SessionGroupChips({
  chips,
  selectedKey,
  onSelect,
}: {
  chips: readonly SessionGroupChip[];
  selectedKey: string | null;
  onSelect(key: string | null): void;
}) {
  const { t } = useTranslation("sessions");
  return (
    <EdgeFadeScrollRow
      accessibilityRole="tablist"
      style={styles.bar}
      contentContainerStyle={styles.chips}
      testID="session-group-chips"
    >
      <Chip
        label={t("list.allGroups")}
        count={null}
        selected={selectedKey === null}
        testID="session-group-all"
        onPress={() => onSelect(null)}
      />
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          count={chip.count}
          selected={chip.key === selectedKey}
          testID={`session-group-${chip.key}`}
          onPress={() => onSelect(chip.key)}
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

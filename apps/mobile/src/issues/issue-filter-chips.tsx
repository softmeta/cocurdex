import type { SavedHost } from "@cocurdex/client-runtime";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { useIssueFilterOptions } from "./issue-filter-options";
import { setIssueFilters, useIssueFilters } from "./issue-filter-store";
import { ISSUE_FILTER_FIELDS, toggledIssueFilter } from "./issue-filters";

const CHIP_HEIGHT = 32;

export function IssueFilterChips({ host }: { host: SavedHost }) {
  const { t } = useTranslation("issues");
  const colors = useThemeColors();
  const filters = useIssueFilters(host.hostId);
  const options = useIssueFilterOptions(host.hostId);
  const chips = ISSUE_FILTER_FIELDS.flatMap((field) =>
    filters[field].map((value) => ({
      field,
      value,
      option: options[field].find((option) => option.value === value),
    })),
  );
  if (chips.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      testID="issue-filter-chips"
    >
      {chips.map(({ field, value, option }) => {
        const label = option?.label ?? value;
        return (
          <Pressable
            key={`${field}-${value}`}
            accessibilityRole="button"
            accessibilityLabel={t("filter.remove", { label })}
            testID={`issue-filter-chip-${value}`}
            onPress={() =>
              setIssueFilters(
                host.hostId,
                toggledIssueFilter(filters, field, value),
              )
            }
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: colors.muted },
              pressed && styles.pressed,
            ]}
          >
            {option?.leading ?? null}
            <Text
              numberOfLines={1}
              style={[styles.label, { color: colors.foreground }]}
            >
              {label}
            </Text>
            <SymbolView
              name={{ ios: "xmark", android: "close" }}
              size={12}
              tintColor={colors.mutedForeground}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: space.xs,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.sm,
  },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: CHIP_HEIGHT / 2,
  },
  pressed: { opacity: 0.7 },
  label: { fontSize: 14, maxWidth: 200 },
});

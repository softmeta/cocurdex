import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { ActionButton } from "./action-button";

export function ListNotice({
  icon,
  title,
  description,
  action,
}: {
  icon?: { ios: SFSymbol; android: AndroidSymbol };
  title: string;
  description?: string;
  action?: { label: string; onPress(): void };
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.notice}>
      {icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.noticeIcon}
        >
          <SymbolView
            name={icon}
            size={36}
            tintColor={colors.mutedForeground}
          />
        </View>
      ) : null}
      <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {description ? (
        <Text
          style={[styles.noticeDescription, { color: colors.mutedForeground }]}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.noticeAction}>
          <ActionButton label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function SectionChevron({ collapsed }: { collapsed: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={styles.chevron}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SymbolView
        name={
          collapsed
            ? { ios: "chevron.right", android: "chevron_right" }
            : { ios: "chevron.down", android: "expand_more" }
        }
        size={13}
        tintColor={colors.mutedForeground}
      />
    </View>
  );
}

export function ListSectionHeader({
  title,
  count,
  collapsed,
  onToggle,
  testID,
}: {
  title: string;
  count?: number;
  collapsed?: boolean;
  onToggle?(): void;
  testID?: string;
}) {
  const colors = useThemeColors();
  const content = (
    <>
      <Text
        numberOfLines={1}
        style={[styles.sectionTitle, { color: colors.mutedForeground }]}
      >
        {title}
      </Text>
      {count === undefined ? null : (
        <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
          {count}
        </Text>
      )}
      {onToggle ? <SectionChevron collapsed={collapsed ?? false} /> : null}
    </>
  );
  if (!onToggle) {
    return (
      <View accessibilityRole="header" style={styles.section} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityValue={
        count === undefined ? undefined : { text: String(count) }
      }
      accessibilityState={{ expanded: !collapsed }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.section,
        { backgroundColor: pressed ? colors.muted : colors.background },
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.sideMargin * 2,
    paddingVertical: space.xxl * 2,
  },
  noticeIcon: { marginBottom: space.lg },
  noticeTitle: { fontSize: 17, lineHeight: 22, textAlign: "center" },
  noticeDescription: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    marginTop: space.sm,
  },
  noticeAction: { marginTop: space.xl },
  section: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.sideMargin,
    marginTop: space.sm,
  },
  sectionTitle: { fontSize: 15, lineHeight: 20, flexShrink: 1 },
  sectionCount: { fontSize: 13, lineHeight: 20 },
  chevron: { marginLeft: "auto" },
});

import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";

const SUGGESTIONS: {
  key: "attention" | "brief" | "memory";
  icon: { ios: SFSymbol; android: AndroidSymbol };
}[] = [
  { key: "attention", icon: { ios: "bell", android: "notifications" } },
  { key: "brief", icon: { ios: "calendar.badge.clock", android: "event" } },
  { key: "memory", icon: { ios: "brain", android: "psychology" } },
];

export function PersonaIntro({ onPick }: { onPick(text: string): void }) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  const texts = {
    attention: t("thread.suggestions.attention"),
    brief: t("thread.suggestions.brief"),
    memory: t("thread.suggestions.memory"),
  };
  return (
    <View
      accessibilityLabel={t("thread.suggestions.label")}
      style={styles.list}
    >
      {SUGGESTIONS.map(({ key, icon }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          testID={`persona-suggestion-${key}`}
          onPress={() => onPick(texts[key])}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.muted },
          ]}
        >
          <SymbolView
            name={icon}
            size={16}
            tintColor={colors.mutedForeground}
          />
          <Text
            numberOfLines={1}
            style={[styles.text, { color: colors.foreground }]}
          >
            {texts[key]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.md,
    gap: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: 12,
  },
  text: { flex: 1, fontSize: 15 },
});

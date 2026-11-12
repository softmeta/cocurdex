import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleAvatar, type RoleAvatarSource } from "@/agents";
import { layout, space, useThemeColors } from "@/theme";
import { ShimmerText } from "@/ui";

const SUGGESTIONS: {
  key: "attention" | "brief" | "memory";
  icon: { ios: SFSymbol; android: AndroidSymbol };
}[] = [
  { key: "attention", icon: { ios: "bell", android: "notifications" } },
  { key: "brief", icon: { ios: "alarm", android: "alarm" } },
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
          <View style={styles.icon}>
            <SymbolView
              name={icon}
              size={16}
              tintColor={colors.mutedForeground}
            />
          </View>
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

export function PersonaGreetingLine({ role }: { role: RoleAvatarSource }) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  return (
    <View style={styles.greeting} accessibilityLiveRegion="polite">
      <RoleAvatar role={role} size={18} />
      <ShimmerText
        text={t("thread.greeting")}
        baseColor={colors.mutedForeground}
        highlightColor={colors.foreground}
        style={styles.greetingText}
        testID="persona-greeting"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 32,
    paddingHorizontal: layout.sideMargin,
    paddingTop: space.md,
  },
  greetingText: { fontSize: 14 },
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
  icon: { width: 20, alignItems: "center" },
  text: { flex: 1, fontSize: 15 },
});

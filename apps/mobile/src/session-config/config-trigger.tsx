import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import { space, useThemeColors } from "@/theme";

export function ConfigTrigger({
  testID,
  leading,
  summary,
  mode,
  onPress,
}: {
  testID: string;
  leading?: ReactNode;
  summary: string;
  mode: string | null;
  onPress(): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const label = [summary, mode].filter(Boolean).join(" · ");
  const textStyle = [styles.label, { color: colors.mutedForeground }];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t("sessionConfig.open", { summary: label })}
      onPress={onPress}
      hitSlop={space.xs}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
    >
      {leading}
      <Text numberOfLines={1} style={[textStyle, styles.summary]}>
        {summary}
      </Text>
      {mode ? <Text style={textStyle}>{`· ${mode}`}</Text> : null}
      <SymbolView
        name={{ ios: "chevron.down", android: "keyboard_arrow_down" }}
        size={12}
        tintColor={colors.mutedForeground}
      />
    </Pressable>
  );
}

const TRIGGER_HEIGHT = 32;

const styles = StyleSheet.create({
  trigger: {
    alignSelf: "flex-end",
    maxWidth: "100%",
    minWidth: 0,
    height: TRIGGER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  pressed: { opacity: 0.5 },
  label: { fontSize: 14 },
  summary: { flexShrink: 1 },
});

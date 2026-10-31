import * as Clipboard from "expo-clipboard";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { control, space, useThemeColors } from "@/theme";

const COPIED_FEEDBACK_MS = 1200;

function ActionButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  onPress(): void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(control.hitArea - control.compact.height) / 2}
      onPress={onPress}
      style={styles.button}
      testID={testID}
    >
      <SymbolView name={icon} size={16} tintColor={colors.mutedForeground} />
    </Pressable>
  );
}

export function TurnActions({
  text,
  onFork,
}: {
  text: string;
  onFork: (() => void) | null;
}) {
  const { t } = useTranslation("sessions");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    });
  };
  return (
    <View style={styles.row}>
      <ActionButton
        icon={
          copied
            ? { ios: "checkmark", android: "check" }
            : { ios: "doc.on.doc", android: "content_copy" }
        }
        label={copied ? t("message.copied") : t("message.copy")}
        onPress={copy}
        testID="turn-copy"
      />
      {onFork ? (
        <ActionButton
          icon={{ ios: "arrow.triangle.branch", android: "call_split" }}
          label={t("message.fork")}
          onPress={onFork}
          testID="turn-fork"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginLeft: -space.sm },
  button: {
    width: control.compact.height,
    height: control.compact.height,
    alignItems: "center",
    justifyContent: "center",
  },
});

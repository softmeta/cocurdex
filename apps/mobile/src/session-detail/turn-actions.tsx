import { formatDurationMs } from "@cocurdex/client-runtime";
import * as Clipboard from "expo-clipboard";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { control, space, useThemeColors } from "@/theme";
import type { TurnEnd } from "./transcript-activity";

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

function TurnMeta({ turn }: { turn: TurnEnd }) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const parts = [
    turn.stopped ? t("message.stopped") : null,
    turn.durationMs === null ? null : formatDurationMs(turn.durationMs),
  ].filter((part) => part !== null);
  if (parts.length === 0) return null;
  return (
    <Text
      style={[styles.meta, { color: colors.mutedForeground }]}
      testID="turn-meta"
    >
      {parts.join(" · ")}
    </Text>
  );
}

export function TurnActions({
  text,
  turn,
  onFork,
}: {
  text: string;
  turn?: TurnEnd;
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
      {turn ? <TurnMeta turn={turn} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: -space.sm,
  },
  button: {
    width: control.compact.height,
    height: control.compact.height,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    marginLeft: space.xs,
  },
});

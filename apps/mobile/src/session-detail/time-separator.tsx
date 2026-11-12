import { formatSeparatorTime } from "@cocurdex/client-runtime";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { space, useThemeColors } from "@/theme";

export function TimeSeparator({ time }: { time: number }) {
  const { i18n } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.row} testID="transcript-time-separator">
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        {formatSeparatorTime(time, Date.now(), i18n.language)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  text: { fontSize: 12, fontVariant: ["tabular-nums"] },
});

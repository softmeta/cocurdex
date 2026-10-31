import { StyleSheet, Text, View } from "react-native";
import { space, useThemeColors } from "@/theme";
import { ShimmerText } from "@/ui";

export function StatusLine({
  text,
  failed,
}: {
  text: string;
  failed: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.statusLine} accessibilityLiveRegion="polite">
      {failed ? (
        <Text style={[styles.statusText, { color: colors.destructive }]}>
          {text}
        </Text>
      ) : (
        <ShimmerText
          text={text}
          baseColor={colors.mutedForeground}
          highlightColor={colors.foreground}
          style={styles.statusText}
          testID="session-running-status"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  statusText: { fontSize: 14 },
});

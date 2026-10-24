import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "@/theme";

export function SessionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string | null;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="header" style={styles.title}>
      <Text
        numberOfLines={1}
        style={[styles.primary, { color: colors.foreground }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={[styles.secondary, { color: colors.mutedForeground }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { alignItems: "center", maxWidth: 240 },
  primary: { fontSize: 17, fontWeight: "600" },
  secondary: { fontSize: 12 },
});

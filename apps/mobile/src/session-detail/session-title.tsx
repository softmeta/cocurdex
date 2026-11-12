import { StyleSheet, Text, View } from "react-native";
import { RoleAvatar, type RoleAvatarSource } from "@/agents";
import { space, useThemeColors } from "@/theme";

export function SessionTitle({
  title,
  subtitle,
  avatar = null,
}: {
  title: string;
  subtitle: string | null;
  avatar?: RoleAvatarSource | null;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="header" style={styles.title}>
      <View style={styles.line}>
        {avatar ? <RoleAvatar role={avatar} size={22} /> : null}
        <Text
          numberOfLines={1}
          style={[styles.primary, { color: colors.foreground }]}
        >
          {title}
        </Text>
      </View>
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
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  primary: { flexShrink: 1, fontSize: 17, fontWeight: "600" },
  secondary: { fontSize: 12 },
});

import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { useAgeLabel } from "@/ui";
import type { NoteRow } from "./note-sections";

const INDENT = 20;

export function NoteRowView({
  row,
  onPress,
}: {
  row: NoteRow;
  onPress(): void;
}) {
  const colors = useThemeColors();
  const age = useAgeLabel(row.note.updatedAt);
  const folder = row.note.kind === "folder";
  return (
    <Pressable
      accessibilityLabel={row.note.title}
      accessibilityRole="button"
      accessibilityValue={{
        text: [row.note.excerpt, age].filter(Boolean).join(", "),
      }}
      disabled={folder}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingLeft: layout.sideMargin + row.depth * INDENT },
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={`note-row-${row.note.id}`}
    >
      <View style={styles.line}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { color: folder ? colors.mutedForeground : colors.foreground },
          ]}
        >
          {row.note.icon ? `${row.note.icon} ` : ""}
          {row.note.title}
        </Text>
        {folder ? null : (
          <Text style={[styles.age, { color: colors.mutedForeground }]}>
            {age}
          </Text>
        )}
      </View>
      {row.note.excerpt ? (
        <Text
          numberOfLines={1}
          style={[styles.excerpt, { color: colors.mutedForeground }]}
        >
          {row.note.excerpt}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.md,
    paddingRight: layout.sideMargin,
  },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  age: { fontSize: 13, fontVariant: ["tabular-nums"] },
  excerpt: { fontSize: 14, lineHeight: 19 },
});

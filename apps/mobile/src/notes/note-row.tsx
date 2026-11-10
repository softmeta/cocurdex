import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  type HostInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { type MenuAnchor, measureAnchor, menuAnchor, useAgeLabel } from "@/ui";
import type { NoteRow } from "./note-sections";

const INDENT = 20;

export function NoteRowView({
  row,
  onPress,
  onActions,
}: {
  row: NoteRow;
  onPress(): void;
  onActions(anchor: MenuAnchor): void;
}) {
  const { t } = useTranslation("notes");
  const colors = useThemeColors();
  const pressable = useRef<HostInstance>(null);
  const age = useAgeLabel(row.note.updatedAt);
  const folder = row.note.kind === "folder";
  return (
    <Pressable
      accessibilityLabel={row.note.title}
      accessibilityRole="button"
      accessibilityValue={{
        text: [row.note.excerpt, age].filter(Boolean).join(", "),
      }}
      accessibilityActions={[{ name: "actions", label: t("actions.title") }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "actions") {
          measureAnchor(pressable.current, onActions);
        }
      }}
      onPress={folder ? undefined : onPress}
      onLongPress={(event) => onActions(menuAnchor(event))}
      ref={pressable}
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

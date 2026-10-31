import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { control, layout, space, useThemeColors } from "@/theme";
import type { NoteEditorFormatState } from "./note-editor-protocol";

type SymbolName = SymbolViewProps["name"];

const ICONS = {
  bold: { ios: "bold", android: "format_bold" },
  bulletList: { ios: "list.bullet", android: "format_list_bulleted" },
  taskList: { ios: "checklist", android: "checklist" },
  hideKeyboard: {
    ios: "keyboard.chevron.compact.down",
    android: "keyboard_hide",
  },
} satisfies Record<string, SymbolName>;

function BarButton({
  label,
  active = false,
  testID,
  onPress,
  children,
}: {
  label: string;
  active?: boolean;
  testID: string;
  onPress(): void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && { backgroundColor: colors.muted },
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function BarSymbol({ name }: { name: SymbolName }) {
  const colors = useThemeColors();
  return <SymbolView name={name} size={20} tintColor={colors.foreground} />;
}

export function NoteFormatBar({
  format,
  bottomInset,
  onBlockStyle,
  onBold,
  onBulletList,
  onTaskList,
  onInsert,
  onHideKeyboard,
}: {
  format: NoteEditorFormatState | null;
  bottomInset: number;
  onBlockStyle(): void;
  onBold(): void;
  onBulletList(): void;
  onTaskList(): void;
  onInsert(): void;
  onHideKeyboard(): void;
}) {
  const { t } = useTranslation("notes");
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: space.xs + bottomInset,
        },
      ]}
    >
      <BarButton
        label={t("editor.format.text")}
        testID="note-format-text"
        onPress={onBlockStyle}
      >
        <Text style={[styles.glyph, { color: colors.foreground }]}>Aa</Text>
      </BarButton>
      <BarButton
        label={t("editor.format.bold")}
        active={format?.marks.bold}
        testID="note-format-bold"
        onPress={onBold}
      >
        <BarSymbol name={ICONS.bold} />
      </BarButton>
      <BarButton
        label={t("editor.format.bulletList")}
        active={format?.bulletList}
        testID="note-format-bullet-list"
        onPress={onBulletList}
      >
        <BarSymbol name={ICONS.bulletList} />
      </BarButton>
      <BarButton
        label={t("editor.format.taskList")}
        active={format?.taskList}
        testID="note-format-task-list"
        onPress={onTaskList}
      >
        <BarSymbol name={ICONS.taskList} />
      </BarButton>
      <BarButton
        label={t("editor.format.insert")}
        testID="note-format-insert"
        onPress={onInsert}
      >
        <Text style={[styles.glyph, { color: colors.foreground }]}>/</Text>
      </BarButton>
      <View style={styles.spacer} />
      <BarButton
        label={t("editor.format.hideKeyboard")}
        testID="note-format-hide-keyboard"
        onPress={onHideKeyboard}
      >
        <BarSymbol name={ICONS.hideKeyboard} />
      </BarButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: layout.sideMargin - space.sm,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    minWidth: control.hitArea,
    height: control.hitArea,
    borderRadius: control.standard.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.5 },
  glyph: { fontSize: 17, fontWeight: "600" },
  spacer: { flex: 1 },
});

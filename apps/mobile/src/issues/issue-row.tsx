import type { IssueRecord } from "@cocurdex/shared";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  type HostInstance,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { type MenuAnchor, measureAnchor, menuAnchor } from "@/ui";
import { IssueStatusMark } from "./issue-status-mark";

export function IssueRowView({
  issue,
  statusTitle,
  labelNames,
  onPress,
  onMove,
}: {
  issue: IssueRecord;
  statusTitle: string;
  labelNames: string[];
  onPress(): void;
  onMove(anchor: MenuAnchor): void;
}) {
  const { t } = useTranslation("issues");
  const colors = useThemeColors();
  const row = useRef<HostInstance>(null);
  const detail = [issue.identifier, ...labelNames].join(" · ");
  return (
    <Pressable
      accessibilityLabel={issue.title}
      accessibilityRole="button"
      accessibilityValue={{ text: `${statusTitle}, ${detail}` }}
      accessibilityActions={[{ name: "move", label: t("move.action") }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "move") {
          measureAnchor(row.current, onMove);
        }
      }}
      onPress={onPress}
      onLongPress={(event) => onMove(menuAnchor(event))}
      ref={row}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={`issue-row-${issue.id}`}
    >
      <View style={styles.mark}>
        <IssueStatusMark category={issue.statusCategory} label={statusTitle} />
      </View>
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {issue.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.detail, { color: colors.mutedForeground }]}
        >
          <Text style={styles.identifier}>{issue.identifier}</Text>
          {labelNames.map((name) => ` · ${name}`).join("")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: layout.sideMargin,
  },
  mark: { height: 22, justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 22 },
  detail: { fontSize: 13, lineHeight: 18 },
  identifier: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
  },
});

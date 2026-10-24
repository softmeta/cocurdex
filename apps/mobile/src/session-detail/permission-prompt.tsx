import {
  type AgentPermissionRequestRecord,
  describePermissionRequest,
  filterDetailsCoveredByText,
  type PermissionDetail,
  type PermissionRequestSummary,
} from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { control, space, useThemeColors } from "@/theme";
import { MONO_FONT } from "./message-markdown";

type FileAction = Extract<PermissionRequestSummary, { kind: "file" }>["action"];

function useSummaryText(summary: PermissionRequestSummary) {
  const { t } = useTranslation("sessions");
  const actions: Record<FileAction, string> = {
    edit: t("permission.actions.edit"),
    read: t("permission.actions.read"),
    use: t("permission.actions.use"),
    write: t("permission.actions.write"),
  };
  if (summary.kind === "command") return t("permission.runCommand");
  if (summary.kind === "file") {
    return t("permission.fileAction", {
      action: actions[summary.action],
      target: summary.target,
    });
  }
  return summary.text;
}

function useDetailLabels(): Record<PermissionDetail["label"], string> {
  const { t } = useTranslation("sessions");
  return {
    Command: t("permission.detail.command"),
    Path: t("permission.detail.path"),
    Pattern: t("permission.detail.pattern"),
    Query: t("permission.detail.query"),
    URL: t("permission.detail.url"),
  };
}

function CodeBlock({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <ScrollView
      style={[styles.code, { backgroundColor: colors.muted }]}
      contentContainerStyle={styles.codeContent}
    >
      <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
        {text}
      </Text>
    </ScrollView>
  );
}

export function PermissionPrompt({
  record,
  title,
}: {
  record: AgentPermissionRequestRecord;
  title(text: string): ReactNode;
}) {
  const colors = useThemeColors();
  const labels = useDetailLabels();
  const display = describePermissionRequest(record);
  const summary = useSummaryText(display.summary);
  const description =
    display.description && !summary.includes(display.description.trim())
      ? display.description
      : null;
  const details = filterDetailsCoveredByText(display.details, [
    summary,
    display.description,
  ]);
  return (
    <>
      {title(summary)}
      {description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
      {details.map((detail) => (
        <View key={`${detail.label}:${detail.value}`} style={styles.detail}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {labels[detail.label]}
          </Text>
          {detail.monospace ? (
            <CodeBlock text={detail.value} />
          ) : (
            <Text
              selectable
              style={[styles.value, { color: colors.foreground }]}
            >
              {detail.value}
            </Text>
          )}
        </View>
      ))}
      {display.rawInput ? <CodeBlock text={display.rawInput} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 15, lineHeight: 21 },
  detail: { gap: space.xs },
  label: { fontSize: 13, fontWeight: "500" },
  value: { fontSize: 15, lineHeight: 21 },
  code: { maxHeight: 144, borderRadius: control.standard.radius },
  codeContent: { paddingHorizontal: space.md, paddingVertical: space.sm },
  codeText: { fontFamily: MONO_FONT, fontSize: 13, lineHeight: 18 },
});

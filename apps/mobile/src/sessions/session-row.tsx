import type { SessionPrimaryState } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { type SessionRow, sessionRowStatus } from "./session-sections";
import { SessionStatusMark } from "./session-status-mark";
import { useAgeLabel } from "./use-age-label";

function useStateDetails(): Record<SessionPrimaryState, string | null> {
  const { t } = useTranslation("sessions");
  return {
    "pending-approval": t("detail.pendingApproval"),
    "awaiting-input": t("detail.awaitingInput"),
    "plan-ready": t("detail.planReady"),
    failed: t("detail.failed"),
    working: t("detail.working"),
    connecting: t("detail.connecting"),
    monitoring: t("detail.monitoring"),
    "completed-unread": t("detail.completedUnread"),
    ready: null,
  };
}

export function SessionRowView({
  row,
  onPress,
}: {
  row: SessionRow;
  onPress(): void;
}) {
  const colors = useThemeColors();
  const age = useAgeLabel(row.activityAt);
  const detail = useStateDetails()[row.state];
  const status = sessionRowStatus(row.state);
  const detailColor =
    status === "failed" ? colors.destructive : colors.mutedForeground;
  const summary = [detail, age].filter(Boolean).join(", ");
  return (
    <Pressable
      accessibilityLabel={row.title}
      accessibilityRole="button"
      accessibilityValue={{ text: summary }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={`session-row-${row.id}`}
    >
      <View style={styles.line}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {row.title}
        </Text>
        <Text style={[styles.age, { color: colors.mutedForeground }]}>
          {age}
        </Text>
      </View>
      {detail ? (
        <View style={styles.line}>
          <Text
            numberOfLines={1}
            style={[styles.detail, { color: detailColor }]}
          >
            {detail}
          </Text>
          <SessionStatusMark status={status} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.sm,
    paddingHorizontal: layout.sideMargin,
  },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1, fontSize: 17, fontWeight: "600" },
  age: { fontSize: 15, fontVariant: ["tabular-nums"] },
  detail: { flex: 1, fontSize: 15 },
});

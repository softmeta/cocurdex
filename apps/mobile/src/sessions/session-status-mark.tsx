import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { type ThemeColors, useThemeColors } from "@/theme";
import type { SessionRowStatus } from "./session-sections";

type MarkedStatus = Exclude<SessionRowStatus, "none" | "failed">;

const MARK_COLOR: Record<MarkedStatus, keyof ThemeColors> = {
  "needs-you": "chatStatusPendingText",
  running: "brandMark",
  unread: "sidebarPrimary",
};

function useMarkLabels(): Record<MarkedStatus, string> {
  const { t } = useTranslation("sessions");
  return {
    "needs-you": t("status.needsYou"),
    running: t("status.running"),
    unread: t("status.unread"),
  };
}

export function SessionStatusMark({ status }: { status: SessionRowStatus }) {
  const labels = useMarkLabels();
  const colors = useThemeColors();
  if (status === "none" || status === "failed") {
    return <View style={styles.slot} />;
  }
  const color = colors[MARK_COLOR[status]];
  const shape =
    status === "running"
      ? [styles.ring, { borderColor: color }]
      : [styles.dot, { backgroundColor: color }];
  return (
    <View
      style={styles.slot}
      accessible
      accessibilityRole="image"
      accessibilityLabel={labels[status]}
    >
      <View style={shape} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
});

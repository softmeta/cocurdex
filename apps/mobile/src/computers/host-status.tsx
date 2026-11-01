import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { type ThemeColors, useThemeColors } from "@/theme";
import {
  type HostReachability,
  useHostReachability,
} from "./host-reachability";

const SLOW_LATENCY_MS = 300;

function dotColor(reachability: HostReachability): keyof ThemeColors {
  switch (reachability.state) {
    case "online":
      return reachability.latencyMs > SLOW_LATENCY_MS
        ? "statusWarning"
        : "statusSuccess";
    case "offline":
    case "unauthorized":
      return "destructive";
    case "checking":
      return "mutedForeground";
  }
}

export function useHostStatusLabel(hostId: string) {
  const { t } = useTranslation("hosts");
  const reachability = useHostReachability(hostId);
  switch (reachability.state) {
    case "online":
      return t("list.status.online", { latency: reachability.latencyMs });
    case "offline":
      return t("list.status.offline");
    case "unauthorized":
      return t("list.status.unauthorized");
    case "checking":
      return t("list.status.checking");
  }
}

export function HostStatus({ hostId }: { hostId: string }) {
  const colors = useThemeColors();
  const reachability = useHostReachability(hostId);
  return (
    <View
      style={[styles.dot, { backgroundColor: colors[dotColor(reachability)] }]}
      testID={`host-status-${hostId}`}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});

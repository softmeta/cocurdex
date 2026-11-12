import type {
  DelegationReportOutcome,
  DelegationSource,
} from "@cocurdex/shared";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { space } from "@/theme";

function outcomeLabel(
  t: TFunction<"sessions">,
  outcome: DelegationReportOutcome | null,
) {
  switch (outcome) {
    case "needs_you":
      return t("detail.delegation.needsYou");
    case "blocked":
      return t("detail.delegation.blocked");
    case "failed":
      return t("detail.delegation.failed");
    case "cancelled":
      return t("detail.delegation.cancelled");
    case "interrupted":
      return t("detail.delegation.interrupted");
    default:
      return t("detail.delegation.finished");
  }
}

function SourceLink({
  source,
  hostId,
  color,
}: {
  source: DelegationSource;
  hostId: string;
  color: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={6}
      onPress={() =>
        router.push({
          pathname: "/session/[hostId]/[sessionId]",
          params: { hostId, sessionId: source.sessionId },
        })
      }
      testID={`delegation-source-${source.sessionId}`}
    >
      <Text numberOfLines={1} style={[styles.text, styles.link, { color }]}>
        {source.title}
      </Text>
    </Pressable>
  );
}

export function DelegationSourcesLine({
  sources,
  hostId,
  color,
}: {
  sources: readonly DelegationSource[];
  hostId: string;
  color: string;
}) {
  const { t } = useTranslation("sessions");
  return (
    <View style={styles.line}>
      <Text style={[styles.text, { color }]}>
        {t("detail.delegation.basedOn")}
      </Text>
      {sources.map((source) => (
        <SourceLink
          key={source.sessionId}
          source={source}
          hostId={hostId}
          color={color}
        />
      ))}
    </View>
  );
}

export function DelegationReportLine({
  report,
  hostId,
  color,
}: {
  report: DelegationSource;
  hostId: string;
  color: string;
}) {
  const { t } = useTranslation("sessions");
  return (
    <View style={styles.line} testID={`delegation-report-${report.sessionId}`}>
      <SourceLink source={report} hostId={hostId} color={color} />
      <Text style={[styles.text, { color }]}>
        · {outcomeLabel(t, report.outcome)} · {t("detail.delegation.awaiting")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.xs,
    marginBottom: space.xs,
  },
  text: { fontSize: 13 },
  link: { textDecorationLine: "underline" },
});

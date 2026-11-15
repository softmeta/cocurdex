import { useTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";
import { space } from "@/theme";
import { DelegationSourcesLine } from "./delegation-line";
import type { PostedSource } from "./transcript";

export function PostedSourceLine({
  source,
  color,
  hostId,
}: {
  source: PostedSource;
  color: string;
  hostId: string;
}) {
  const { t } = useTranslation("sessions");
  if (source.kind === "delegation") {
    return (
      <DelegationSourcesLine
        sources={source.sources}
        hostId={hostId}
        color={color}
      />
    );
  }
  let label: string = t("detail.postedBrief");
  if (source.kind === "followUp") label = t("detail.postedFollowUp");
  if (source.kind === "routine") {
    label = t("detail.postedRoutine", { name: source.name });
  }
  return <Text style={[styles.postedSource, { color }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  postedSource: { fontSize: 13, marginBottom: space.xs },
});

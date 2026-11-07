import { useTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";
import { space } from "@/theme";
import type { PostedSource } from "./transcript";

export function PostedSourceLine({
  source,
  color,
}: {
  source: PostedSource;
  color: string;
}) {
  const { t } = useTranslation("sessions");
  const label =
    source.kind === "brief"
      ? t("detail.postedBrief")
      : t("detail.postedRoutine", { name: source.name });
  return <Text style={[styles.postedSource, { color }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  postedSource: { fontSize: 13, marginBottom: space.xs },
});

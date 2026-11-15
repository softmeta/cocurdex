import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";
import {
  CircleButton,
  FormCell,
  FormSection,
  FormSupportingText,
  FormText,
  formMetrics,
} from "@/ui";
import { cancelFollowUp, usePendingFollowUps } from "./assistant-queries";

const ALARM = { ios: "bell", android: "notifications" } as const;
const CLOSE = { ios: "xmark", android: "close" } as const;

export function AssistantFollowUps({
  hostId,
  personaId,
}: {
  hostId: string;
  personaId: string;
}) {
  const { t, i18n } = useTranslation("assistant");
  const colors = useThemeColors();
  const followUps = usePendingFollowUps(hostId, personaId);
  if (!followUps.data || followUps.data.length === 0) return null;
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const cancel = (id: string) =>
    void cancelFollowUp(hostId, id).catch(() => followUps.mutate());
  return (
    <FormSection title={t("overview.followUps")}>
      {followUps.data.map((followUp) => {
        const due = format.format(new Date(followUp.dueAt));
        return (
          <FormCell key={followUp.id}>
            <View
              style={styles.row}
              testID={`assistant-overview-follow-up-${followUp.id}`}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <SymbolView
                  name={ALARM}
                  size={18}
                  tintColor={colors.mutedForeground}
                />
              </View>
              <View
                accessible
                accessibilityLabel={`${followUp.note}, ${due}`}
                style={styles.content}
              >
                <FormText>{followUp.note}</FormText>
                <FormSupportingText>{due}</FormSupportingText>
              </View>
              <CircleButton
                icon={CLOSE}
                label={t("overview.cancelFollowUp")}
                onPress={() => cancel(followUp.id)}
                testID={`assistant-overview-follow-up-cancel-${followUp.id}`}
              />
            </View>
          </FormCell>
        );
      })}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: formMetrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingStart: formMetrics.pagePadding,
    paddingEnd: formMetrics.pagePadding - 12,
    paddingVertical: 4,
  },
  content: { flex: 1, minWidth: 0 },
});

import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "@/theme";
import { CircleButton, FormRow, FormSection } from "@/ui";
import { cancelFollowUp, usePendingFollowUps } from "./assistant-queries";

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
  return (
    <FormSection title={t("overview.followUps")}>
      {followUps.data.map((followUp) => (
        <FormRow
          key={followUp.id}
          testID={`assistant-overview-follow-up-${followUp.id}`}
          supporting={format.format(new Date(followUp.dueAt))}
          leading={
            <SymbolView
              name={{ ios: "bell", android: "notifications" }}
              size={18}
              tintColor={colors.mutedForeground}
            />
          }
          trailing={
            <CircleButton
              icon={{ ios: "xmark", android: "close" }}
              label={t("overview.cancelFollowUp")}
              onPress={() =>
                void cancelFollowUp(hostId, followUp.id).catch(() =>
                  followUps.mutate(),
                )
              }
            />
          }
        >
          {followUp.note}
        </FormRow>
      ))}
    </FormSection>
  );
}

import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";
import {
  CircleButton,
  FormCell,
  FormSection,
  FormText,
  formMetrics,
} from "@/ui";
import { forgetToldItem, useToldItems } from "./assistant-queries";

const TOLD = { ios: "text.bubble", android: "chat" } as const;
const CLOSE = { ios: "xmark", android: "close" } as const;

export function AssistantTold({
  hostId,
  personaId,
}: {
  hostId: string;
  personaId: string;
}) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  const told = useToldItems(hostId, personaId);
  if (!told.data || told.data.length === 0) return null;
  const forget = (item: string) =>
    void forgetToldItem(hostId, personaId, item).catch(() => told.mutate());
  return (
    <FormSection title={t("overview.told")} footer={t("overview.toldHint")}>
      {told.data.map((item, index) => (
        <FormCell key={item}>
          <View style={styles.row}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <SymbolView
                name={TOLD}
                size={18}
                tintColor={colors.mutedForeground}
              />
            </View>
            <View accessible style={styles.content}>
              <FormText>{item}</FormText>
            </View>
            <CircleButton
              icon={CLOSE}
              label={t("overview.forgetTold")}
              onPress={() => forget(item)}
              testID={`assistant-overview-told-forget-${index}`}
            />
          </View>
        </FormCell>
      ))}
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

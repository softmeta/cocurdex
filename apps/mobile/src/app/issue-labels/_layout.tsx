import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SheetSurface } from "@/theme";
import { useSheetStackOptions } from "@/ui";

function IssueLabelsStack() {
  const { t } = useTranslation("issues");
  const screenOptions = useSheetStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="[hostId]/[issueId]"
        options={{ title: t("field.labels") }}
      />
    </Stack>
  );
}

export default function IssueLabelsLayout() {
  return (
    <SheetSurface>
      <IssueLabelsStack />
    </SheetSurface>
  );
}

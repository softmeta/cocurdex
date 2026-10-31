import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SheetSurface } from "@/theme";
import { useSheetStackOptions } from "@/ui";

function IssueFiltersStack() {
  const { t } = useTranslation("issues");
  const screenOptions = useSheetStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t("filter.title") }} />
      <Stack.Screen name="[field]" />
    </Stack>
  );
}

export default function IssueFiltersLayout() {
  return (
    <SheetSurface>
      <IssueFiltersStack />
    </SheetSurface>
  );
}

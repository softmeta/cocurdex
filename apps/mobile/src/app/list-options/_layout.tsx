import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SheetSurface } from "@/theme";
import { useSheetStackOptions } from "@/ui";

function ListOptionsStack() {
  const { t } = useTranslation("sessions");
  const screenOptions = useSheetStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t("list.options.title") }} />
      <Stack.Screen name="[field]" />
    </Stack>
  );
}

export default function ListOptionsLayout() {
  return (
    <SheetSurface>
      <ListOptionsStack />
    </SheetSurface>
  );
}

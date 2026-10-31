import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SheetSurface } from "@/theme";
import { OptionSheetRouteProvider, useSheetStackOptions } from "@/ui";

function NewSessionConfigStack() {
  const { t } = useTranslation("sessions");
  const screenOptions = useSheetStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t("newSession.title") }} />
      <Stack.Screen name="save-role" options={{ title: t("saveRole.title") }} />
      <Stack.Screen name="options/[id]" />
    </Stack>
  );
}

export default function NewSessionConfigLayout() {
  return (
    <SheetSurface>
      <OptionSheetRouteProvider pathname="/new-session/config/options/[id]">
        <NewSessionConfigStack />
      </OptionSheetRouteProvider>
    </SheetSurface>
  );
}

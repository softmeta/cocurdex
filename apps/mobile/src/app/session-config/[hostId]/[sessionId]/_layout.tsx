import { Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { SheetSurface } from "@/theme";
import { OptionSheetRouteProvider, useSheetStackOptions } from "@/ui";

function SessionConfigStack() {
  const { t } = useTranslation("sessions");
  const screenOptions = useSheetStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "" }} />
      <Stack.Screen name="save-role" options={{ title: t("saveRole.title") }} />
      <Stack.Screen name="options/[id]" />
    </Stack>
  );
}

export default function SessionConfigLayout() {
  const { hostId, sessionId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
  }>();
  return (
    <SheetSurface>
      <OptionSheetRouteProvider
        pathname="/session-config/[hostId]/[sessionId]/options/[id]"
        params={{ hostId, sessionId }}
      >
        <SessionConfigStack />
      </OptionSheetRouteProvider>
    </SheetSurface>
  );
}

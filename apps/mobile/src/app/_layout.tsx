import "@/runtime";
import "@/i18n";
import { Stack, ThemeProvider } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, useColorScheme } from "react-native";
import { navigationThemes, useThemeColors } from "@/theme";

const PAIR_PRESENTATION = Platform.OS === "ios" ? "formSheet" : "modal";
const PUSH_ANIMATION =
  Platform.OS === "android" ? "slide_from_right" : "default";

export default function RootLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = useThemeColors();
  return (
    <ThemeProvider value={navigationThemes[scheme]}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/[hostId]/[sessionId]"
          options={{
            title: "",
            headerBackButtonDisplayMode: "minimal",
            headerBackTitle: t("tabs.sessions"),
            animation: PUSH_ANIMATION,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="pair"
          options={{
            title: t("screens.pair"),
            presentation: PAIR_PRESENTATION,
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

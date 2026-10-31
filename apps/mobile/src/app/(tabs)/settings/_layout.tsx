import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { useGroupedColors } from "@/theme";
import { useHeaderOptions } from "@/ui";

const PUSH_ANIMATION =
  Platform.OS === "android" ? "slide_from_right" : "default";

export default function SettingsLayout() {
  const { t } = useTranslation();
  const grouped = useGroupedColors();
  const headerOptions = useHeaderOptions();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t("screens.settings"),
          headerShown: false,
          contentStyle: { backgroundColor: grouped.page },
        }}
      />
      <Stack.Screen
        name="font-size"
        options={{
          title: t("screens.fontSize"),
          animation: PUSH_ANIMATION,
          headerStyle: { backgroundColor: grouped.page },
          contentStyle: { backgroundColor: grouped.page },
        }}
      />
      <Stack.Screen
        name="language"
        options={{
          title: t("screens.language"),
          animation: PUSH_ANIMATION,
          headerStyle: { backgroundColor: grouped.page },
          contentStyle: { backgroundColor: grouped.page },
        }}
      />
    </Stack>
  );
}

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function AssistantLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: t("screens.assistant"), headerShown: false }}
      />
    </Stack>
  );
}

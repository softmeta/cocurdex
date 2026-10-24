import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function ComputersLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: t("screens.computers"), headerLargeTitle: true }}
      />
    </Stack>
  );
}

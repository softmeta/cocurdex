import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { CircleButton } from "./circle-button";

export function HeaderBackButton() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <CircleButton
      tonal
      icon={{ ios: "chevron.left", android: "arrow_back" }}
      label={t("actions.back")}
      onPress={() => router.back()}
      testID="header-back"
    />
  );
}

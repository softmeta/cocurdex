import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { CloseButton } from "./close-button";

export function ModalCloseButton() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <CloseButton
      accessibilityLabel={t("actions.close")}
      onPress={() => router.back()}
    />
  );
}

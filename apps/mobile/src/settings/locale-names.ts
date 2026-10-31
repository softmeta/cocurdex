import type { SupportedLocale } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export const LOCALE_ENDONYMS: Record<SupportedLocale, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
};

export function useLocaleNames(): Record<SupportedLocale, string> {
  const { t } = useTranslation("settings");
  return {
    "en-US": t("language.names.enUS"),
    "zh-CN": t("language.names.zhCN"),
  };
}

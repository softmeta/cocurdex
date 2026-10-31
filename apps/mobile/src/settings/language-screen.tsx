import { type SupportedLocale, supportedLocales } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { getSystemLocale } from "@/i18n";
import {
  type LanguagePreference,
  setLanguage,
  usePreferences,
} from "@/preferences";
import { Form, FormRow, FormSection, SelectedMark } from "@/ui";
import { LOCALE_ENDONYMS, useLocaleNames } from "./locale-names";

function localeSupporting(endonym: string, translated: string) {
  return endonym === translated ? undefined : translated;
}

export function LanguageScreen() {
  const router = useRouter();
  const { t } = useTranslation("settings");
  const { language } = usePreferences();
  const names = useLocaleNames();
  const systemLocale = getSystemLocale();
  const choose = (next: LanguagePreference) => {
    setLanguage(next);
    router.back();
  };
  const localeRow = (locale: SupportedLocale) => (
    <FormRow
      key={locale}
      testID={`settings-language-${locale}`}
      onPress={() => choose(locale)}
      supporting={localeSupporting(LOCALE_ENDONYMS[locale], names[locale])}
      trailing={<SelectedMark selected={language === locale} />}
    >
      {LOCALE_ENDONYMS[locale]}
    </FormRow>
  );
  return (
    <Form>
      <FormSection>
        <FormRow
          testID="settings-language-system"
          onPress={() => choose("system")}
          supporting={LOCALE_ENDONYMS[systemLocale]}
          trailing={<SelectedMark selected={language === "system"} />}
        >
          {t("language.system")}
        </FormRow>
      </FormSection>
      <FormSection>{supportedLocales.map(localeRow)}</FormSection>
    </Form>
  );
}

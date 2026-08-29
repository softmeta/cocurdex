import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageMode } from "@/i18n/language";
import { localeDescriptors, supportedLocales } from "@/i18n/language";
import { SettingsSelect } from "./settings-select";

interface LanguagePickerProps {
  value: LanguageMode;
  onChange(value: LanguageMode): void;
}

// Short list (system + current locales); not searchable.
export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const { t } = useTranslation("settings");

  const options = useMemo(
    () => [
      { label: t("language.modes.system"), value: "system" },
      ...supportedLocales.map((locale) => ({
        label: localeDescriptors[locale].nativeName,
        value: locale,
      })),
    ],
    [t],
  );

  return (
    <SettingsSelect
      ariaLabel={t("language.title")}
      compact
      options={options}
      value={value}
      onChange={(next) => onChange(next as LanguageMode)}
    />
  );
}

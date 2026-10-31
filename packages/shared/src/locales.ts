export const supportedLocales = ["en-US", "zh-CN"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const DEFAULT_LOCALE = "en-US" satisfies SupportedLocale;

const LOCALE_BY_LANGUAGE: Record<string, SupportedLocale> = {
  en: "en-US",
  zh: "zh-CN",
};

export function isSupportedLocale(
  value: string | null,
): value is SupportedLocale {
  return supportedLocales.some((locale) => locale === value);
}

export function matchSupportedLocale(
  languageTags: readonly string[],
): SupportedLocale {
  for (const tag of languageTags) {
    const language = tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
    const locale = LOCALE_BY_LANGUAGE[language];
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

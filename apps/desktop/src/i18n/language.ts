import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  matchSupportedLocale,
  type SupportedLocale,
  supportedLocales,
} from "@cocurdex/shared";

export {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
  supportedLocales,
};

export const languageModes = ["system", ...supportedLocales] as const;

export type LanguageMode = (typeof languageModes)[number];

export interface LocaleDescriptor {
  locale: SupportedLocale;
  // Endonym: each language is labelled in its own script so the picker stays
  // legible regardless of the active UI locale. Intentionally not translated.
  nativeName: string;
}

// Single source of truth for picker labels. Add new locales here (and to
// supportedLocales) — the language picker renders straight from this table.
export const localeDescriptors: Record<SupportedLocale, LocaleDescriptor> = {
  "en-US": { locale: "en-US", nativeName: "English" },
  "zh-CN": { locale: "zh-CN", nativeName: "简体中文" },
};

export const LANGUAGE_MODE_STORAGE_KEY = "agents.desktop.language-mode";

export function isLanguageMode(value: string | null): value is LanguageMode {
  return value === "system" || isSupportedLocale(value);
}

export function getStoredLanguageMode(): LanguageMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedLanguageMode = window.localStorage.getItem(
    LANGUAGE_MODE_STORAGE_KEY,
  );
  return isLanguageMode(storedLanguageMode) ? storedLanguageMode : "system";
}

export function getSystemLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  return matchSupportedLocale(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
}

export function resolveLanguageMode(
  languageMode: LanguageMode,
  systemLocale: SupportedLocale,
): SupportedLocale {
  return languageMode === "system" ? systemLocale : languageMode;
}

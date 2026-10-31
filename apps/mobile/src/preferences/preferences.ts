import { isSupportedLocale, type SupportedLocale } from "@cocurdex/shared";

export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];
export type LanguagePreference = "system" | SupportedLocale;
export const TEXT_SIZES = ["small", "default", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const CODE_SIZES = ["small", "default", "large"] as const;
export type CodeSize = (typeof CODE_SIZES)[number];

export const TEXT_SCALE: Record<TextSize, number> = {
  small: 0.9,
  default: 1,
  large: 1.12,
  xlarge: 1.25,
};
export const CODE_SCALE: Record<CodeSize, number> = {
  small: 0.9,
  default: 1,
  large: 1.15,
};

export interface Preferences {
  appearance: AppearancePreference;
  language: LanguagePreference;
  textSize: TextSize;
  codeSize: CodeSize;
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: "system",
  language: "system",
  textSize: "default",
  codeSize: "default",
};

function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return values.find((candidate) => candidate === value) ?? fallback;
}

export function scaledSize(size: number, scale: number) {
  return Math.round(size * scale * 2) / 2;
}

function isAppearance(value: unknown): value is AppearancePreference {
  return APPEARANCE_PREFERENCES.some((candidate) => candidate === value);
}

function isLanguage(value: unknown): value is LanguagePreference {
  return (
    value === "system" ||
    (typeof value === "string" && isSupportedLocale(value))
  );
}

export function parsePreferences(text: string | null): Preferences {
  if (!text) return DEFAULT_PREFERENCES;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof stored !== "object" || stored === null) return DEFAULT_PREFERENCES;
  const record = stored as Record<string, unknown>;
  return {
    appearance: isAppearance(record.appearance)
      ? record.appearance
      : DEFAULT_PREFERENCES.appearance,
    language: isLanguage(record.language)
      ? record.language
      : DEFAULT_PREFERENCES.language,
    textSize: oneOf(TEXT_SIZES, record.textSize, DEFAULT_PREFERENCES.textSize),
    codeSize: oneOf(CODE_SIZES, record.codeSize, DEFAULT_PREFERENCES.codeSize),
  };
}

export type ColorSchemeName = "light" | "dark";

export function resolveColorScheme(
  appearance: AppearancePreference,
  systemScheme: string | null | undefined,
): ColorSchemeName {
  if (appearance !== "system") return appearance;
  return systemScheme === "dark" ? "dark" : "light";
}

export function resolveLocale(
  language: LanguagePreference,
  systemLocale: SupportedLocale,
): SupportedLocale {
  return language === "system" ? systemLocale : language;
}

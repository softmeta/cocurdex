import {
  DEFAULT_THEME_PRESET_ID,
  isThemePresetId,
  type ThemePresetId,
} from "./theme-presets";

export const themeModes = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof themeModes)[number];

export type { ThemePresetId } from "./theme-presets";
export {
  applyThemePreset,
  DEFAULT_THEME_PRESET_ID,
  getThemePresetMeta,
  isThemePresetId,
  listThemePresets,
  themePresetIds,
} from "./theme-presets";

export const THEME_MODE_STORAGE_KEY = "agents.desktop.theme-mode";
export const APPEARANCE_SETTINGS_STORAGE_KEY =
  "agents.desktop.appearance-settings";

export interface AppearanceSettings {
  codeFontFamily: string;
  codeFontSize: number;
  /** Named color pack applied for both light and dark resolved modes. */
  themePreset: ThemePresetId;
  uiFontFamily: string;
  uiFontSize: number;
}

export const defaultAppearanceSettings: AppearanceSettings = {
  codeFontFamily: "",
  codeFontSize: 13,
  themePreset: DEFAULT_THEME_PRESET_ID,
  uiFontFamily: "",
  uiFontSize: 13,
};

/**
 * Allowed Appearance font-size ranges (px, integer steps in the UI).
 * Kept narrow so type can scale without fixed rem chrome (h-8, size-4)
 * looking badly mismatched.
 */
export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 16;
export const CODE_FONT_SIZE_MIN = 11;
export const CODE_FONT_SIZE_MAX = 18;

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function getStoredThemeMode() {
  if (typeof window === "undefined") {
    return "system" satisfies ThemeMode;
  }

  const storedThemeMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  return isThemeMode(storedThemeMode) ? storedThemeMode : "system";
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeFontFamily(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function clampUiFontSize(value: unknown) {
  return clampNumber(
    value,
    UI_FONT_SIZE_MIN,
    UI_FONT_SIZE_MAX,
    defaultAppearanceSettings.uiFontSize,
  );
}

export function clampCodeFontSize(value: unknown) {
  return clampNumber(
    value,
    CODE_FONT_SIZE_MIN,
    CODE_FONT_SIZE_MAX,
    defaultAppearanceSettings.codeFontSize,
  );
}

export function getStoredAppearanceSettings(): AppearanceSettings {
  if (typeof window === "undefined") {
    return defaultAppearanceSettings;
  }

  const storedSettings = window.localStorage.getItem(
    APPEARANCE_SETTINGS_STORAGE_KEY,
  );

  if (!storedSettings) {
    return defaultAppearanceSettings;
  }

  try {
    const parsed = JSON.parse(storedSettings) as Partial<AppearanceSettings>;

    const themePreset =
      typeof parsed.themePreset === "string" &&
      isThemePresetId(parsed.themePreset)
        ? parsed.themePreset
        : defaultAppearanceSettings.themePreset;

    return {
      codeFontFamily: normalizeFontFamily(parsed.codeFontFamily),
      codeFontSize: clampCodeFontSize(parsed.codeFontSize),
      themePreset,
      uiFontFamily: normalizeFontFamily(parsed.uiFontFamily),
      uiFontSize: clampUiFontSize(parsed.uiFontSize),
    };
  } catch {
    return defaultAppearanceSettings;
  }
}

export function resolveThemeMode(
  themeMode: ThemeMode,
  prefersDark: boolean,
): "light" | "dark" {
  if (themeMode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

import {
  APPEARANCE_SETTINGS_STORAGE_KEY,
  type AppearanceSettings,
  applyThemePreset,
  clampCodeFontSize,
  clampUiFontSize,
  getStoredAppearanceSettings,
  getStoredNotificationSettings,
  getStoredThemeMode,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  type NotificationSettings,
  resolveThemeMode,
  THEME_MODE_STORAGE_KEY,
  type ThemeMode,
} from "@/features/settings";
import { i18n } from "@/i18n";
import {
  getStoredLanguageMode,
  getSystemLocale,
  LANGUAGE_MODE_STORAGE_KEY,
  type LanguageMode,
  resolveLanguageMode,
  type SupportedLocale,
} from "@/i18n/language";
import { desktopApi, emitThemeChanged } from "@/lib";
import { resolveCssVariableColorToHex } from "./surface-color";

const SYSTEM_UI_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const SYSTEM_MONO_FONT =
  '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

export function syncLanguageMode(
  languageMode: LanguageMode,
  systemLocale: SupportedLocale,
) {
  const resolvedLanguage = resolveLanguageMode(languageMode, systemLocale);

  document.documentElement.dir = "ltr";
  window.localStorage.setItem(LANGUAGE_MODE_STORAGE_KEY, languageMode);

  if (i18n.language !== resolvedLanguage) {
    void i18n.changeLanguage(resolvedLanguage);
  }
}

export function persistNotificationSettings(settings: NotificationSettings) {
  window.localStorage.setItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
}

function resolveCurrentPrefersDark() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Re-apply the stored color preset for the given resolved light/dark surface.
 * Must run after `data-theme` is updated so chrome tokens and
 * window surface colors match the active mode.
 */
function syncThemePresetForResolvedTheme(
  themePreset: AppearanceSettings["themePreset"],
  resolvedTheme: "light" | "dark",
) {
  applyThemePreset(themePreset, resolvedTheme);
  emitThemeChanged();

  const surface = resolveCssVariableColorToHex("--app-bg");
  if (surface) {
    void desktopApi.setWindowSurfaceColor(surface);
  }
}

function applyResolvedTheme(resolvedTheme: "light" | "dark") {
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;

  // Light/dark flip must re-bind the active preset's matching token map.
  const { themePreset } = getStoredAppearanceSettings();
  syncThemePresetForResolvedTheme(themePreset, resolvedTheme);
}

export function syncThemeMode(themeMode: ThemeMode, prefersDark: boolean) {
  document.documentElement.dataset.themeMode = themeMode;
  window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  applyResolvedTheme(resolveThemeMode(themeMode, prefersDark));
}

declare global {
  interface Window {
    __cocurdexDebug?: {
      previewTheme(theme: "light" | "dark"): void;
      restoreTheme(): void;
    };
  }
}

function installThemeDebugHook() {
  window.__cocurdexDebug = {
    previewTheme: applyResolvedTheme,
    restoreTheme: () =>
      applyResolvedTheme(
        resolveThemeMode(getStoredThemeMode(), resolveCurrentPrefersDark()),
      ),
  };
}

export function syncAppearanceSettings(appearanceSettings: AppearanceSettings) {
  const root = document.documentElement;
  const uiFont = appearanceSettings.uiFontFamily || SYSTEM_UI_FONT;
  const codeFont = appearanceSettings.codeFontFamily || SYSTEM_MONO_FONT;
  const uiFontSize = clampUiFontSize(appearanceSettings.uiFontSize);
  const codeFontSize = clampCodeFontSize(appearanceSettings.codeFontSize);
  const normalized: AppearanceSettings = {
    ...appearanceSettings,
    uiFontSize,
    codeFontSize,
  };

  root.style.setProperty("--font-ui", uiFont);
  root.style.setProperty("--font-mono", codeFont);
  root.style.setProperty("--app-ui-font-size", `${uiFontSize}px`);
  root.style.setProperty("--app-code-font-size", `${codeFontSize}px`);
  // Drop legacy reduce-transparency flag if present from older builds.
  delete root.dataset.reduceTransparency;

  window.localStorage.setItem(
    APPEARANCE_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalized),
  );

  // Preset may change while mode stays put (or vice versa after cold start).
  const themeMode = getStoredThemeMode();
  const resolvedTheme = resolveThemeMode(
    themeMode,
    resolveCurrentPrefersDark(),
  );
  syncThemePresetForResolvedTheme(normalized.themePreset, resolvedTheme);
}

export function syncInitialPreferences() {
  if (typeof window === "undefined") {
    return;
  }

  const themeMode = getStoredThemeMode();
  const prefersDark = resolveCurrentPrefersDark();

  syncLanguageMode(getStoredLanguageMode(), getSystemLocale());
  persistNotificationSettings(getStoredNotificationSettings());
  // Mode first (sets data-theme), then appearance (fonts +
  // rebinds the preset token map for the resolved light/dark surface).
  syncThemeMode(themeMode, prefersDark);
  syncAppearanceSettings(getStoredAppearanceSettings());
  if (import.meta.env.DEV) installThemeDebugHook();
}

export {
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
  CODE_SIZES,
  type CodeSize,
  type ColorSchemeName,
  type LanguagePreference,
  resolveLocale,
  scaledSize,
  TEXT_SIZES,
  type TextSize,
} from "./preferences";
export {
  currentPreferences,
  setAppearance,
  setCodeSize,
  setLanguage,
  setTextSize,
  subscribePreferences,
  useCodeScale,
  useColorSchemeName,
  usePreferences,
  useTextScale,
} from "./preferences-store";

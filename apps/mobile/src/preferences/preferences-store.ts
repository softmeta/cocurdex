import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import {
  type AppearancePreference,
  CODE_SCALE,
  type CodeSize,
  type LanguagePreference,
  type Preferences,
  parsePreferences,
  resolveColorScheme,
  TEXT_SCALE,
  type TextSize,
} from "./preferences";

const file = new File(Paths.document, "preferences.json");
const listeners = new Set<() => void>();

function readStored() {
  try {
    return parsePreferences(file.exists ? file.textSync() : null);
  } catch {
    return parsePreferences(null);
  }
}

function applyAppearance(appearance: AppearancePreference) {
  Appearance.setColorScheme(
    appearance === "system" ? "unspecified" : appearance,
  );
}

let current = readStored();
applyAppearance(current.appearance);

function update(next: Preferences) {
  current = next;
  for (const listener of listeners) listener();
  void file.write(JSON.stringify(next)).catch(() => undefined);
}

export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentPreferences() {
  return current;
}

export function setAppearance(appearance: AppearancePreference) {
  if (appearance === current.appearance) return;
  applyAppearance(appearance);
  update({ ...current, appearance });
}

export function setLanguage(language: LanguagePreference) {
  if (language === current.language) return;
  update({ ...current, language });
}

export function setTextSize(textSize: TextSize) {
  if (textSize === current.textSize) return;
  update({ ...current, textSize });
}

export function setCodeSize(codeSize: CodeSize) {
  if (codeSize === current.codeSize) return;
  update({ ...current, codeSize });
}

function currentTextScale() {
  return TEXT_SCALE[current.textSize];
}

function currentCodeScale() {
  return CODE_SCALE[current.codeSize];
}

export function useTextScale() {
  return useSyncExternalStore(subscribePreferences, currentTextScale);
}

export function useCodeScale() {
  return useSyncExternalStore(subscribePreferences, currentCodeScale);
}

export function usePreferences() {
  return useSyncExternalStore(subscribePreferences, currentPreferences);
}

function currentColorScheme() {
  return resolveColorScheme(current.appearance, Appearance.getColorScheme());
}

function subscribeColorScheme(listener: () => void) {
  listeners.add(listener);
  const subscription = Appearance.addChangeListener(listener);
  return () => {
    listeners.delete(listener);
    subscription.remove();
  };
}

export function useColorSchemeName() {
  return useSyncExternalStore(subscribeColorScheme, currentColorScheme);
}

import "./plural-rules";
import { DEFAULT_LOCALE, supportedLocales } from "@cocurdex/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { AppState } from "react-native";
import {
  currentPreferences,
  resolveLocale,
  subscribePreferences,
} from "@/preferences";
import { getSystemLocale } from "./language";
import { resources } from "./resources";

function preferredLocale() {
  return resolveLocale(currentPreferences().language, getSystemLocale());
}

function followPreferredLocale() {
  const locale = preferredLocale();
  if (locale !== i18n.language) void i18n.changeLanguage(locale);
}

void i18n.use(initReactI18next).init({
  defaultNS: "common",
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  lng: preferredLocale(),
  resources,
  supportedLngs: [...supportedLocales],
});

AppState.addEventListener("change", (state) => {
  if (state === "active") followPreferredLocale();
});
subscribePreferences(followPreferredLocale);

export { getSystemLocale } from "./language";
export { i18n };

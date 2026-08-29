import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, getSystemLocale, supportedLocales } from "./language";
import { resources } from "./resources";

void i18n.use(initReactI18next).init({
  defaultNS: "common",
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    escapeValue: false,
  },
  lng: getSystemLocale(),
  resources,
  supportedLngs: [...supportedLocales],
});

export { i18n };

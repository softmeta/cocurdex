import { matchSupportedLocale } from "@cocurdex/shared";
import { getLocales } from "expo-localization";

export function getSystemLocale() {
  return matchSupportedLocale(getLocales().map((locale) => locale.languageTag));
}

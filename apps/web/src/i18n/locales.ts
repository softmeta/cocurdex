/** Site locales: URL segment + BCP-47 lang tag. English stays unprefixed. */
export const locales = ["en", "zh-cn"] as const;
export type SiteLocale = (typeof locales)[number];
export const defaultLocale: SiteLocale = "en";

export const localeLabels: Record<SiteLocale, string> = {
  en: "English",
  "zh-cn": "简体中文",
};

export const htmlLangs: Record<SiteLocale, string> = {
  en: "en",
  "zh-cn": "zh-CN",
};

export const ogLocales: Record<SiteLocale, string> = {
  en: "en_US",
  "zh-cn": "zh_CN",
};

export function isSiteLocale(value: string): value is SiteLocale {
  return (locales as readonly string[]).includes(value);
}

/** `/download/` → `/zh-cn/download/` for zh, unchanged for en. */
export function localizedPath(locale: SiteLocale, path: string) {
  return locale === defaultLocale ? path : `/${locale}${path}`;
}

/** Strip a leading locale prefix so alternates can be rebuilt. */
export function unlocalizedPath(path: string) {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    const prefix = `/${locale}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length - 1);
    if (path === `/${locale}`) return "/";
  }
  return path;
}

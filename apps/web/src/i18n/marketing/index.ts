import type { SiteLocale } from "../locales";
import { dict as en, type MarketingDict } from "./en";
import { dict as zhCn } from "./zh-cn";

const dicts: Record<SiteLocale, MarketingDict> = {
  en,
  "zh-cn": zhCn,
};

export function getMarketingDict(locale: SiteLocale): MarketingDict {
  return dicts[locale];
}

export type { MarketingDict };

import { supportedLocales } from "@cocurdex/shared";
import { createInstance } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  Reflect.deleteProperty(Intl, "PluralRules");
  await import("@cocurdex/mobile/internal/i18n/plural-rules");
});

describe("plural rules without engine support", () => {
  it("has plural rules for every supported locale", () => {
    for (const locale of supportedLocales) {
      const language = locale.split("-")[0];
      expect(new Intl.PluralRules(locale).resolvedOptions().locale).toMatch(
        new RegExp(`^${language}`),
      );
    }
  });

  it("formats a count of one with the locale's own plural form", async () => {
    const { resources } = await import(
      "@cocurdex/mobile/internal/i18n/resources"
    );
    const i18n = createInstance();
    await i18n.init({
      lng: "zh-CN",
      fallbackLng: "en-US",
      defaultNS: "common",
      resources,
    });
    expect(i18n.t("age.minutes", { count: 1 })).toBe("1分钟");
    await i18n.changeLanguage("en-US");
    expect(i18n.t("age.minutes", { count: 1 })).toBe("1m");
  });
});

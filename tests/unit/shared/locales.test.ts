import { isSupportedLocale, matchSupportedLocale } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("matchSupportedLocale", () => {
  it("maps any Chinese script or region to zh-CN", () => {
    expect(matchSupportedLocale(["zh-Hans-CN"])).toBe("zh-CN");
    expect(matchSupportedLocale(["zh-TW"])).toBe("zh-CN");
    expect(matchSupportedLocale(["zh_CN"])).toBe("zh-CN");
  });

  it("follows the user's preference order", () => {
    expect(matchSupportedLocale(["en-GB", "zh-CN"])).toBe("en-US");
    expect(matchSupportedLocale(["fr-FR", "zh-Hans", "en-US"])).toBe("zh-CN");
  });

  it("falls back to en-US when no preferred language is supported", () => {
    expect(matchSupportedLocale(["fr-FR", "de-DE"])).toBe("en-US");
    expect(matchSupportedLocale([])).toBe("en-US");
  });
});

describe("isSupportedLocale", () => {
  it("accepts only the exact supported tags", () => {
    expect(isSupportedLocale("zh-CN")).toBe(true);
    expect(isSupportedLocale("zh")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n";

describe("document language", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("matches the language the interface renders in", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");

    await i18n.changeLanguage("en-US");
    expect(document.documentElement.lang).toBe("en-US");
  });
});

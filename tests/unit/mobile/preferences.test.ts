import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  resolveColorScheme,
  resolveLocale,
  scaledSize,
} from "@cocurdex/mobile/internal/preferences/preferences";
import { describe, expect, it } from "vitest";

describe("parsePreferences", () => {
  it("reads stored choices", () => {
    expect(
      parsePreferences(
        JSON.stringify({ appearance: "dark", language: "zh-CN" }),
      ),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      appearance: "dark",
      language: "zh-CN",
    });
    expect(
      parsePreferences(
        JSON.stringify({ textSize: "xlarge", codeSize: "large" }),
      ),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      textSize: "xlarge",
      codeSize: "large",
    });
  });

  it("falls back per field for missing, unknown, or corrupt values", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{not json")).toEqual(DEFAULT_PREFERENCES);
    expect(
      parsePreferences(
        JSON.stringify({
          appearance: "sepia",
          language: "fr",
          textSize: "huge",
          codeSize: 3,
        }),
      ),
    ).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(JSON.stringify({ language: "en-US" }))).toEqual({
      ...DEFAULT_PREFERENCES,
      language: "en-US",
    });
  });
});

describe("scaledSize", () => {
  it("scales to the nearest half point", () => {
    expect(scaledSize(16, 1)).toBe(16);
    expect(scaledSize(16, 1.12)).toBe(18);
    expect(scaledSize(12.5, 0.9)).toBe(11.5);
  });
});

describe("resolveLocale", () => {
  it("uses the system locale unless the user picked one", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("en-US", "zh-CN")).toBe("en-US");
  });
});

describe("resolveColorScheme", () => {
  it("uses an explicit appearance over the system scheme", () => {
    expect(resolveColorScheme("light", "dark")).toBe("light");
    expect(resolveColorScheme("dark", "light")).toBe("dark");
  });

  it("follows the system scheme and defaults to light", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
    expect(resolveColorScheme("system", null)).toBe("light");
  });
});

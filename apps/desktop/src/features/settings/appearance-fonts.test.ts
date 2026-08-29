import { describe, expect, it } from "vitest";
import {
  buildSystemFontOptions,
  fallbackUiFontOptions,
  fontOptionsForValue,
  toCssFontFamilyValue,
} from "./appearance-fonts";

describe("appearance fonts", () => {
  it("quotes CSS font family values", () => {
    expect(toCssFontFamilyValue("Menlo")).toBe('"Menlo"');
    expect(toCssFontFamilyValue("JetBrains Mono")).toBe('"JetBrains Mono"');
    expect(toCssFontFamilyValue('Weird "Name"')).toBe('"Weird \\"Name\\""');
  });

  it("builds system options with system default first", () => {
    const options = buildSystemFontOptions(
      ["Menlo", "Arial"],
      "System font",
      "",
    );
    expect(options[0]).toEqual({
      id: "system",
      label: "System font",
      value: "",
    });
    expect(options.map((o) => o.label)).toEqual([
      "System font",
      "Menlo",
      "Arial",
    ]);
    expect(options[1]?.value).toBe('"Menlo"');
  });

  it("keeps a custom current value not in the system list", () => {
    const options = buildSystemFontOptions(
      ["Arial"],
      "System font",
      '"Legacy Font"',
    );
    expect(options.some((o) => o.value === '"Legacy Font"')).toBe(true);
  });

  it("uses fallback when system families are missing", () => {
    const options = fontOptionsForValue(
      fallbackUiFontOptions,
      "",
      "System font",
      null,
    );
    expect(options[0]?.label).toBe("System font");
    expect(options.length).toBe(fallbackUiFontOptions.length);
  });

  it("prefers system families when available", () => {
    const options = fontOptionsForValue(
      fallbackUiFontOptions,
      "",
      "System font",
      ["OnlyOne"],
    );
    expect(options.map((o) => o.label)).toEqual(["System font", "OnlyOne"]);
  });
});

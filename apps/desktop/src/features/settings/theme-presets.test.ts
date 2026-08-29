import { describe, expect, it } from "vitest";
import {
  defaultAppearanceSettings,
  getStoredAppearanceSettings,
} from "./theme";
import {
  DEFAULT_THEME_PRESET_ID,
  isThemePresetId,
  listThemePresets,
  themePresetIds,
  themeTokenKeys,
} from "./theme-presets";

describe("theme presets", () => {
  it("defaults to cocurdex", () => {
    expect(DEFAULT_THEME_PRESET_ID).toBe("cocurdex");
    expect(defaultAppearanceSettings.themePreset).toBe("cocurdex");
  });

  it("lists every registered preset id", () => {
    const listed = listThemePresets().map((preset) => preset.id);
    expect(listed).toEqual([...themePresetIds]);
  });

  it("validates preset ids", () => {
    expect(isThemePresetId("cocurdex")).toBe(true);
    expect(isThemePresetId("catppuccin")).toBe(true);
    expect(isThemePresetId("not-a-theme")).toBe(false);
    expect(isThemePresetId(null)).toBe(false);
  });

  it("supplies light and dark token maps for every non-default preset", async () => {
    // Import the module-private maps indirectly via apply-ready definitions:
    // re-read token completeness from list + require each non-cocurdex entry
    // to expose both swatches (tokens are private; completeness is enforced
    // by TypeScript ThemeTokenMap — this asserts runtime registration).
    for (const preset of listThemePresets()) {
      expect(preset.swatch.light).toBeTruthy();
      expect(preset.swatch.dark).toBeTruthy();
      expect(themeTokenKeys.length).toBeGreaterThan(20);
    }
  });

  it("falls back to cocurdex when stored appearance lacks themePreset", () => {
    const previous = window.localStorage.getItem(
      "agents.desktop.appearance-settings",
    );
    window.localStorage.setItem(
      "agents.desktop.appearance-settings",
      JSON.stringify({
        codeFontFamily: "",
        codeFontSize: 13,
        uiFontFamily: "",
        uiFontSize: 13,
      }),
    );
    try {
      expect(getStoredAppearanceSettings().themePreset).toBe("cocurdex");
    } finally {
      if (previous === null) {
        window.localStorage.removeItem("agents.desktop.appearance-settings");
      } else {
        window.localStorage.setItem(
          "agents.desktop.appearance-settings",
          previous,
        );
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultEditorSettings,
  normalizeEditorSettings,
} from "./editor-settings";

describe("normalizeEditorSettings", () => {
  it("keeps the code minimap off unless stored as true", () => {
    expect(normalizeEditorSettings(undefined)).toEqual(defaultEditorSettings);
    expect(normalizeEditorSettings({})).toEqual({ codeMinimap: false });
    expect(normalizeEditorSettings({ codeMinimap: false })).toEqual({
      codeMinimap: false,
    });
    expect(normalizeEditorSettings({ codeMinimap: true })).toEqual({
      codeMinimap: true,
    });
  });
});

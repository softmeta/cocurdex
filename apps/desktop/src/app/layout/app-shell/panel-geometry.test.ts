import { describe, expect, it } from "vitest";
import { clampPanelWidth, resolveCompactPanel } from "./panel-geometry";

describe("panel reading space", () => {
  it("stops a divider at 375 pixels of chat space", () => {
    expect(clampPanelWidth(900, 1000)).toBe(624);
  });

  it("keeps the floating panel wide enough but inside the viewport", () => {
    expect(clampPanelWidth(900, 600)).toBe(460);
    expect(clampPanelWidth(200, 1000)).toBe(460);
  });

  it("uses a buffer when returning from compact to split layout", () => {
    expect(resolveCompactPanel(836, false)).toBe(false);
    expect(resolveCompactPanel(835, false)).toBe(true);
    expect(resolveCompactPanel(840, true)).toBe(true);
    expect(resolveCompactPanel(859, true)).toBe(true);
    expect(resolveCompactPanel(860, true)).toBe(false);
  });
});

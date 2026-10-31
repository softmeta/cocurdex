import { menuTop } from "@cocurdex/mobile/internal/ui/menu-placement";
import { describe, expect, it } from "vitest";

const bounds = { top: 60, bottom: 800 };

describe("menuTop", () => {
  it("opens below the anchor when the menu fits", () => {
    const anchor = { x: 100, y: 200, top: 160 };
    expect(menuTop(anchor, 300, bounds)).toBe(208);
  });

  it("flips above the anchor's top edge without covering it", () => {
    const anchor = { x: 100, y: 780, top: 740 };
    const top = menuTop(anchor, 300, bounds);
    expect(top + 300).toBeLessThanOrEqual(740 - 8);
    expect(top).toBe(432);
  });

  it("treats a point anchor as both edges", () => {
    const anchor = { x: 100, y: 700 };
    expect(menuTop(anchor, 300, bounds)).toBe(392);
  });

  it("stays inside the bounds when neither side fits", () => {
    const anchor = { x: 100, y: 400, top: 360 };
    expect(menuTop(anchor, 700, bounds)).toBe(60);
  });
});

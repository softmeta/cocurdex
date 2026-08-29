import { describe, expect, it } from "vitest";
import { clampOffset } from "@/components/chat/use-vertical-drag";

// The panel is clamped relative to its own natural top within the container,
// so a panel anchored near the bottom (large panelTop) can travel far up but
// only a little down — it never slides past the container edge and gets
// clipped by `overflow-hidden`.
describe("clampOffset", () => {
  // container 200, panel 40, anchored near bottom (top 136):
  //   up room   = margin - top         = 8 - 136 = -128
  //   down room = h - margin - ph - top = 200 - 8 - 40 - 136 = 16
  it("keeps an in-range offset unchanged", () => {
    expect(clampOffset(10, 200, 40, 136)).toBe(10);
    expect(clampOffset(-30, 200, 40, 136)).toBe(-30);
  });

  it("clamps downward travel to the container's bottom edge", () => {
    expect(clampOffset(500, 200, 40, 136)).toBe(16);
  });

  it("clamps upward travel to the container's top edge", () => {
    expect(clampOffset(-500, 200, 40, 136)).toBe(-128);
  });

  it("allows a top-anchored panel to travel far down but little up", () => {
    // container 200, panel 40, anchored near top (top 8):
    //   up room   = 8 - 8 = 0
    //   down room = 200 - 8 - 40 - 8 = 144
    expect(clampOffset(500, 200, 40, 8)).toBe(144);
    expect(clampOffset(-50, 200, 40, 8)).toBe(0);
  });

  it("pins to zero when the panel barely fits the container", () => {
    expect(clampOffset(50, 40, 40, 0)).toBeCloseTo(0);
    expect(clampOffset(-50, 40, 40, 0)).toBeCloseTo(0);
  });
});

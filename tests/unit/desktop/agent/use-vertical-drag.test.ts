import { describe, expect, it } from "vitest";
import { clampOffset } from "@/components/chat/use-vertical-drag";

describe("clampOffset", () => {
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
    expect(clampOffset(500, 200, 40, 8)).toBe(144);
    expect(clampOffset(-50, 200, 40, 8)).toBe(0);
  });

  it("pins to zero when the panel barely fits the container", () => {
    expect(clampOffset(50, 40, 40, 0)).toBeCloseTo(0);
    expect(clampOffset(-50, 40, 40, 0)).toBeCloseTo(0);
  });
});

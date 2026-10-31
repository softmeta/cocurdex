import { describe, expect, it } from "vitest";
import {
  isScrollNearBottom,
  isScrollNearTop,
  STICK_TO_BOTTOM_THRESHOLD,
} from "@/components/chat";

describe("isScrollNearBottom", () => {
  it("is near bottom within the threshold", () => {
    expect(isScrollNearBottom(1000, 400, 600)).toBe(true);
    expect(
      isScrollNearBottom(1000, 400, 1000 - 400 - STICK_TO_BOTTOM_THRESHOLD),
    ).toBe(true);
  });

  it("is not near bottom past the threshold", () => {
    expect(
      isScrollNearBottom(1000, 400, 1000 - 400 - STICK_TO_BOTTOM_THRESHOLD - 1),
    ).toBe(false);
    expect(isScrollNearBottom(1000, 400, 0)).toBe(false);
  });
});

describe("isScrollNearTop", () => {
  it("is near the top within the threshold", () => {
    expect(isScrollNearTop(0)).toBe(true);
    expect(isScrollNearTop(STICK_TO_BOTTOM_THRESHOLD)).toBe(true);
  });

  it("is not near the top past the threshold", () => {
    expect(isScrollNearTop(STICK_TO_BOTTOM_THRESHOLD + 1)).toBe(false);
  });
});

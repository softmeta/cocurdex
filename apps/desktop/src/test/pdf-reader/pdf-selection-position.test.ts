import { describe, expect, it } from "vitest";
import { placeFixedBubble } from "@/features/pdf-reader/pdf-selection-position";

const bubble = { width: 280, height: 36 };
const viewport = { width: 1000, height: 800 };

describe("placeFixedBubble", () => {
  it("places below-start when there is room", () => {
    expect(
      placeFixedBubble(
        { left: 100, top: 200, width: 80, height: 20 },
        bubble,
        viewport,
      ),
    ).toEqual({ left: 100, top: 228 });
  });

  it("shifts left when the bubble would overflow the right edge", () => {
    const result = placeFixedBubble(
      { left: 900, top: 200, width: 40, height: 20 },
      bubble,
      viewport,
    );
    // 1000 - 280 - 8 padding
    expect(result.left).toBe(712);
    expect(result.top).toBe(228);
  });

  it("clamps to the left padding when anchor is near the left edge", () => {
    const result = placeFixedBubble(
      { left: 2, top: 100, width: 40, height: 20 },
      bubble,
      viewport,
    );
    expect(result.left).toBe(8);
  });

  it("flips above the selection when it would overflow the bottom", () => {
    const result = placeFixedBubble(
      { left: 100, top: 760, width: 80, height: 20 },
      bubble,
      viewport,
    );
    // above = 760 - 8 - 36 = 716
    expect(result).toEqual({ left: 100, top: 716 });
  });

  it("clamps inside the viewport when neither above nor below fits", () => {
    const tallBubble = { width: 100, height: 900 };
    const result = placeFixedBubble(
      { left: 50, top: 10, width: 40, height: 20 },
      tallBubble,
      { width: 400, height: 200 },
    );
    // max(8, 200 - 900 - 8) = 8
    expect(result.top).toBe(8);
    expect(result.left).toBe(50);
  });
});

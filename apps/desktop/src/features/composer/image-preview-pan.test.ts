import { describe, expect, it } from "vitest";
import {
  clampImagePreviewPan,
  imagePreviewContentSize,
} from "./image-preview-pan";

describe("imagePreviewContentSize", () => {
  it("scales the fitted image by zoom", () => {
    expect(imagePreviewContentSize({ height: 200, width: 400 }, 2, 0)).toEqual({
      height: 400,
      width: 800,
    });
  });

  it("swaps axes on quarter turns", () => {
    expect(
      imagePreviewContentSize({ height: 200, width: 400 }, 1.5, 90),
    ).toEqual({ height: 600, width: 300 });
    expect(
      imagePreviewContentSize({ height: 200, width: 400 }, 1.5, 270),
    ).toEqual({ height: 600, width: 300 });
  });

  it("keeps axes on half turns", () => {
    expect(
      imagePreviewContentSize({ height: 200, width: 400 }, 1, 180),
    ).toEqual({ height: 200, width: 400 });
  });
});

describe("clampImagePreviewPan", () => {
  it("keeps the offset centered when the content fits", () => {
    expect(
      clampImagePreviewPan(
        { x: 50, y: -30 },
        { height: 300, width: 400 },
        { height: 200, width: 300 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("clamps each axis to half the overflow", () => {
    const viewport = { height: 300, width: 400 };
    const content = { height: 700, width: 800 };
    expect(
      clampImagePreviewPan({ x: 500, y: -500 }, viewport, content),
    ).toEqual({ x: 200, y: -200 });
    expect(
      clampImagePreviewPan({ x: -150, y: 120 }, viewport, content),
    ).toEqual({ x: -150, y: 120 });
  });

  it("clamps axes independently", () => {
    expect(
      clampImagePreviewPan(
        { x: 500, y: 50 },
        { height: 300, width: 400 },
        { height: 250, width: 800 },
      ),
    ).toEqual({ x: 200, y: 0 });
  });
});

import { describe, expect, it } from "vitest";
import {
  clampPreviewPan,
  previewBaseScale,
  previewContentSize,
  previewFrameSize,
} from "@/components/media-preview/preview-geometry";

describe("previewContentSize", () => {
  it("scales the fitted image by zoom", () => {
    expect(previewContentSize({ height: 200, width: 400 }, 2, 0)).toEqual({
      height: 400,
      width: 800,
    });
  });

  it("swaps axes on quarter turns", () => {
    expect(previewContentSize({ height: 200, width: 400 }, 1.5, 90)).toEqual({
      height: 600,
      width: 300,
    });
    expect(previewContentSize({ height: 200, width: 400 }, 1.5, 270)).toEqual({
      height: 600,
      width: 300,
    });
  });

  it("keeps axes on half turns", () => {
    expect(previewContentSize({ height: 200, width: 400 }, 1, 180)).toEqual({
      height: 200,
      width: 400,
    });
  });
});

describe("clampPreviewPan", () => {
  it("keeps the offset centered when the content fits", () => {
    expect(
      clampPreviewPan(
        { x: 50, y: -30 },
        { height: 300, width: 400 },
        { height: 200, width: 300 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("clamps each axis to half the overflow", () => {
    const viewport = { height: 300, width: 400 };
    const content = { height: 700, width: 800 };
    expect(clampPreviewPan({ x: 500, y: -500 }, viewport, content)).toEqual({
      x: 200,
      y: -200,
    });
    expect(clampPreviewPan({ x: -150, y: 120 }, viewport, content)).toEqual({
      x: -150,
      y: 120,
    });
  });

  it("clamps axes independently", () => {
    expect(
      clampPreviewPan(
        { x: 500, y: 50 },
        { height: 300, width: 400 },
        { height: 250, width: 800 },
      ),
    ).toEqual({ x: 200, y: 0 });
  });
});

describe("previewBaseScale", () => {
  const viewport = { height: 600, width: 1000 };

  it("fits large content inside the viewport", () => {
    expect(
      previewBaseScale({ height: 1200, width: 1600 }, viewport, {
        max: 1,
        min: 0.25,
      }),
    ).toBe(0.5);
  });

  it("caps upscaling of small content at the maximum", () => {
    expect(
      previewBaseScale({ height: 100, width: 200 }, viewport, {
        max: 2,
        min: 0.75,
      }),
    ).toBe(2);
    expect(
      previewBaseScale({ height: 100, width: 200 }, viewport, {
        max: 1,
        min: 0.75,
      }),
    ).toBe(1);
  });

  it("keeps tall content at the minimum scale so it overflows vertically", () => {
    expect(
      previewBaseScale({ height: 4000, width: 800 }, viewport, {
        max: 1,
        min: 0.75,
      }),
    ).toBe(0.75);
  });

  it("never lets the minimum scale overflow the viewport width", () => {
    expect(
      previewBaseScale({ height: 8000, width: 2000 }, viewport, {
        max: 1,
        min: 0.75,
      }),
    ).toBe(0.5);
  });
});

describe("previewFrameSize", () => {
  it("fits the rotated bounds and keeps the unrotated aspect", () => {
    expect(
      previewFrameSize(
        { height: 400, width: 1200 },
        { height: 600, width: 1000 },
        90,
        { max: 1, min: 0.25 },
      ),
    ).toEqual({ height: 200, width: 600 });
  });
});

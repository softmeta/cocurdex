import { describe, expect, it } from "vitest";
import { predictBrowserBounds } from "./browser-view-resize";

const viewport = { width: 1280, height: 760 };
const panel = { x: 820, y: 106, width: 460, height: 453 };

function contains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  window: { width: number; height: number },
) {
  const right = Math.min(inner.x + inner.width, window.width);
  const bottom = Math.min(inner.y + inner.height, window.height);
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right <= outer.x + outer.width &&
    bottom <= outer.y + outer.height
  );
}

describe("predictBrowserBounds", () => {
  it("keeps the last report while the window size is unchanged", () => {
    expect(predictBrowserBounds(panel, viewport, viewport)).toEqual(panel);
  });

  it("slides a trailing fixed-width panel with a growing window", () => {
    const grown = { width: 1380, height: 760 };
    expect(predictBrowserBounds(panel, viewport, grown)).toEqual({
      ...panel,
      x: 920,
    });
  });

  it("stays inside the container for fixed and stretching layouts", () => {
    const sizes = [
      { width: 1380, height: 860 },
      { width: 1180, height: 660 },
      { width: 1380, height: 660 },
      { width: 1180, height: 860 },
    ];
    for (const size of sizes) {
      const dw = size.width - viewport.width;
      const dh = size.height - viewport.height;
      const predicted = predictBrowserBounds(panel, viewport, size);
      const fixed = { ...panel, x: panel.x + dw, height: panel.height + dh };
      const stretched = {
        ...panel,
        width: panel.width + dw,
        height: panel.height + dh,
      };
      expect(contains(fixed, predicted, size)).toBe(true);
      expect(contains(stretched, predicted, size)).toBe(true);
    }
  });

  it("never grows past zero size when the window collapses", () => {
    const predicted = predictBrowserBounds(panel, viewport, {
      width: 1280,
      height: 100,
    });
    expect(predicted.height).toBe(0);
  });

  it("tracks the learned anchoring exactly in both directions", () => {
    const shrunk = { width: 1180, height: 700 };
    expect(
      predictBrowserBounds(panel, viewport, shrunk, {
        x: "end",
        y: "stretch",
      }),
    ).toEqual({ ...panel, x: 720, height: 393 });
    expect(
      predictBrowserBounds(panel, viewport, shrunk, {
        x: "stretch",
        y: "start",
      }),
    ).toEqual({ ...panel, width: 360 });
  });
});

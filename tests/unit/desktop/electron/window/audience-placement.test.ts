import { audienceWindowPlacement } from "@desktop/electron/window/audience-placement";
import { describe, expect, it } from "vitest";

const laptop = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  workArea: { x: 0, y: 38, width: 1512, height: 944 },
};
const projector = {
  id: 2,
  bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1512, y: 0, width: 1920, height: 1080 },
};

describe("audienceWindowPlacement", () => {
  it("fills a display other than the presenter's", () => {
    expect(audienceWindowPlacement([laptop, projector], laptop.id)).toEqual({
      bounds: projector.bounds,
      fullscreen: true,
    });
    expect(audienceWindowPlacement([laptop, projector], projector.id)).toEqual({
      bounds: laptop.bounds,
      fullscreen: true,
    });
  });

  it("opens a centered window on the only display", () => {
    expect(audienceWindowPlacement([laptop], laptop.id)).toEqual({
      bounds: { x: 276, y: 240, width: 960, height: 540 },
      fullscreen: false,
    });
  });

  it("shrinks the window to fit a small work area", () => {
    const small = {
      id: 3,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      workArea: { x: 0, y: 0, width: 800, height: 500 },
    };
    expect(audienceWindowPlacement([small], small.id).bounds).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 500,
    });
  });
});

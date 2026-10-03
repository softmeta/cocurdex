import { describe, expect, it } from "vitest";
import { learnBrowserViewAnchor } from "./browser-view-anchor";

const before = { start: 820, size: 460 };

describe("learnBrowserViewAnchor", () => {
  it("recognizes a fixed-width panel pinned to the trailing edge", () => {
    expect(
      learnBrowserViewAnchor(before, { start: 790, size: 460 }, -30, undefined),
    ).toBe("end");
  });

  it("recognizes a panel that stretches with the window", () => {
    expect(
      learnBrowserViewAnchor(before, { start: 820, size: 430 }, -30, "end"),
    ).toBe("stretch");
  });

  it("recognizes a panel pinned to the leading edge", () => {
    expect(learnBrowserViewAnchor(before, before, 40, "end")).toBe("start");
  });

  it("keeps what it knew when the window size did not change", () => {
    expect(
      learnBrowserViewAnchor(before, { start: 700, size: 580 }, 0, "end"),
    ).toBe("end");
  });

  it("keeps what it knew when the layout changed in some other way", () => {
    expect(
      learnBrowserViewAnchor(before, { start: 600, size: 300 }, -30, "end"),
    ).toBe("end");
  });
});

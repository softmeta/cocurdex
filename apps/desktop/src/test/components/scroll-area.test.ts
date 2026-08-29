import { describe, expect, it } from "vitest";

import { getScrollOverflow } from "@/components/ui/scroll-area";

// Browsers floor `clientHeight` and ceil `scrollHeight`, so a fractional content
// height reports a phantom 1px overflow. `getScrollOverflow` must treat a <=1px
// difference as "no overflow" so the custom scrollbar never shows for content
// that visually fits (the bug that previously forced a native scrollbar).
describe("getScrollOverflow", () => {
  it("reports no overflow when content fits exactly", () => {
    expect(
      getScrollOverflow({
        scrollHeight: 200,
        clientHeight: 200,
        scrollWidth: 100,
        clientWidth: 100,
      }),
    ).toEqual({ x: false, y: false });
  });

  it("ignores a phantom 1px sub-pixel overflow", () => {
    expect(
      getScrollOverflow({
        scrollHeight: 201,
        clientHeight: 200,
        scrollWidth: 101,
        clientWidth: 100,
      }),
    ).toEqual({ x: false, y: false });
  });

  it("reports vertical overflow beyond the 1px tolerance", () => {
    expect(
      getScrollOverflow({
        scrollHeight: 202,
        clientHeight: 200,
        scrollWidth: 100,
        clientWidth: 100,
      }),
    ).toEqual({ x: false, y: true });
  });

  it("reports horizontal overflow beyond the 1px tolerance", () => {
    expect(
      getScrollOverflow({
        scrollHeight: 200,
        clientHeight: 200,
        scrollWidth: 140,
        clientWidth: 100,
      }),
    ).toEqual({ x: true, y: false });
  });
});

import { containFrame } from "@cocurdex/deck";
import { describe, expect, it } from "vitest";

describe("containFrame", () => {
  it("letterboxes a wide image inside a box", () => {
    expect(
      containFrame({ x: 0, y: 0, w: 400, h: 400 }, { width: 200, height: 100 }),
    ).toEqual({ x: 0, y: 100, w: 400, h: 200 });
  });

  it("pillarboxes a tall image inside a box", () => {
    expect(
      containFrame(
        { x: 100, y: 50, w: 400, h: 200 },
        { width: 100, height: 200 },
      ),
    ).toEqual({ x: 250, y: 50, w: 100, h: 200 });
  });
});

import { describe, expect, it } from "vitest";
import {
  CHAT_DOCK_MIN_HEIGHT,
  CHAT_DOCK_MIN_WIDTH,
  CHAT_FAB_SIZE_PX,
  fitFabPositionToWindow,
  fitFloatingGeometryToWindow,
} from "@/app/layout/chat-dock-geometry";

describe("fitFabPositionToWindow", () => {
  // Matches TOP_MARGIN in chat-dock-geometry (titlebar + edge padding).
  const topMargin = 40;
  const edgeMargin = 8;

  it("leaves position unchanged when the FAB still fits", () => {
    const position = { right: 16, bottom: 16 };
    expect(fitFabPositionToWindow(position, 1200, 900)).toEqual(position);
  });

  it("pulls right/bottom in when the FAB would overflow", () => {
    const off = { right: 400, bottom: 400 };
    const next = fitFabPositionToWindow(off, 200, 200);
    expect(next.right + CHAT_FAB_SIZE_PX).toBeLessThanOrEqual(200 - edgeMargin);
    expect(next.bottom + CHAT_FAB_SIZE_PX).toBeLessThanOrEqual(200 - topMargin);
  });

  it("keeps the FAB below the titlebar header zone", () => {
    const winH = 900;
    const next = fitFabPositionToWindow(
      { right: 16, bottom: winH },
      1200,
      winH,
    );
    // Top edge of the FAB must stay under the header clearance.
    expect(winH - next.bottom - CHAT_FAB_SIZE_PX).toBeGreaterThanOrEqual(
      topMargin,
    );
    expect(next.bottom).toBe(winH - CHAT_FAB_SIZE_PX - topMargin);
  });

  it("clamps to the edge margin on tiny windows", () => {
    const next = fitFabPositionToWindow({ right: 0, bottom: 0 }, 80, 80);
    expect(next.right).toBe(edgeMargin);
    expect(next.bottom).toBe(edgeMargin);
  });
});

describe("fitFloatingGeometryToWindow", () => {
  const base = {
    right: 16,
    bottom: 16,
    width: 380,
    height: 560,
  };

  it("leaves geometry unchanged when the window still fits the card", () => {
    expect(fitFloatingGeometryToWindow(base, 1200, 900)).toEqual(base);
  });

  it("shrinks height when the window becomes shorter", () => {
    const next = fitFloatingGeometryToWindow(base, 1200, 400);
    expect(next.height).toBeLessThan(base.height);
    expect(next.height + next.bottom).toBeLessThanOrEqual(400 - 40);
    expect(next.width).toBe(base.width);
  });

  it("shrinks width when the window becomes narrower", () => {
    const next = fitFloatingGeometryToWindow(base, 300, 900);
    expect(next.width).toBeLessThan(base.width);
    expect(next.width + next.right).toBeLessThanOrEqual(300 - 8);
    expect(next.height).toBe(base.height);
  });

  it("does not grow size when the window expands past the card", () => {
    const small = { right: 16, bottom: 16, width: 320, height: 360 };
    const next = fitFloatingGeometryToWindow(small, 2000, 1400);
    expect(next.width).toBe(small.width);
    expect(next.height).toBe(small.height);
  });

  it("pulls right/bottom in when the card would overflow", () => {
    const off = { right: 400, bottom: 400, width: 380, height: 360 };
    const next = fitFloatingGeometryToWindow(off, 500, 500);
    expect(next.right + next.width).toBeLessThanOrEqual(500 - 8);
    expect(next.bottom + next.height).toBeLessThanOrEqual(500 - 40);
  });

  it("allows size below the usual min when the window itself is smaller", () => {
    const next = fitFloatingGeometryToWindow(base, 200, 200);
    expect(next.width).toBeLessThan(CHAT_DOCK_MIN_WIDTH);
    expect(next.height).toBeLessThan(CHAT_DOCK_MIN_HEIGHT);
    expect(next.width).toBeGreaterThan(0);
    expect(next.height).toBeGreaterThan(0);
  });
});

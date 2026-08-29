import { describe, expect, it } from "vitest";
import {
  MAX_LEFT,
  MIN_LEFT,
  resolveRightPanelVisibility,
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_TOOLBAR_MIN_WIDTH,
} from "@/app/layout/app-shell/app-shell-layout";
import { clampLeftWidth } from "@/app/layout/app-shell/app-shell-resize";

describe("app shell layout metrics", () => {
  it("keeps the minimum sidebar width wide enough for the titlebar toolbar", () => {
    // traffic-light reserve 80 + 3 × size-6 (24) + 2 × gap-1 (4) = 160.
    expect(MIN_LEFT).toBeGreaterThanOrEqual(TITLEBAR_TOOLBAR_MIN_WIDTH);
    expect(TITLEBAR_TOOLBAR_MIN_WIDTH).toBe(160);
  });

  it("reserves titlebar space for the four right-side chrome icons", () => {
    // px-3 (24) + 4 × size-6 (24) + 3 × gap-1 (4) = 132.
    expect(TITLEBAR_EDITOR_TOGGLE_WIDTH).toBe(132);
  });

  it("caps the session sidebar so a wide window cannot drag it past MAX_LEFT", () => {
    expect(MAX_LEFT).toBe(400);
    expect(MAX_LEFT).toBeGreaterThan(MIN_LEFT);
    // Plenty of free space would allow ~thousands of px without the absolute cap.
    expect(clampLeftWidth(800, 2000, 280)).toBe(MAX_LEFT);
    expect(clampLeftWidth(200, 2000, 280)).toBe(200);
  });
});

describe("resolveRightPanelVisibility", () => {
  it("hides the panel when closed", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: false,
        isMaximized: false,
        canSplit: true,
      }),
    ).toEqual({ shouldShow: false, isGlobal: false });
  });

  it("renders split when open and wide enough", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: true,
        isMaximized: false,
        canSplit: true,
      }),
    ).toEqual({ shouldShow: true, isGlobal: false });
  });

  it("renders global when maximized", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: true,
        isMaximized: true,
        canSplit: true,
      }),
    ).toEqual({ shouldShow: true, isGlobal: true });
  });

  it("forces global when the window is too narrow to split", () => {
    // Regression: below the split width the toggle flipped state but the panel
    // never rendered, so clicking the right-panel toggle looked dead.
    expect(
      resolveRightPanelVisibility({
        isOpen: true,
        isMaximized: false,
        canSplit: false,
      }),
    ).toEqual({ shouldShow: true, isGlobal: true });
  });
});

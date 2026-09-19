import { describe, expect, it } from "vitest";
import {
  MAX_LEFT,
  MIN_LEFT,
  resolvePanelFullWidth,
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
    expect(TITLEBAR_EDITOR_TOGGLE_WIDTH).toBe(132);
  });

  it("caps the session sidebar so a wide window cannot drag it past MAX_LEFT", () => {
    expect(MAX_LEFT).toBe(400);
    expect(MAX_LEFT).toBeGreaterThan(MIN_LEFT);
    // Plenty of free space would allow ~thousands of px without the absolute cap.
    expect(clampLeftWidth(800, 2000)).toBe(MAX_LEFT);
    expect(clampLeftWidth(200, 2000)).toBe(200);
  });
});

describe("resolveRightPanelVisibility", () => {
  it("hides the panel when closed", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: false,
        isMaximized: false,
      }),
    ).toEqual({ shouldShow: false, isGlobal: false });
  });

  it("opens without taking over the reading area", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: true,
        isMaximized: false,
      }),
    ).toEqual({ shouldShow: true, isGlobal: false });
  });

  it("renders global when maximized", () => {
    expect(
      resolveRightPanelVisibility({
        isOpen: true,
        isMaximized: true,
      }),
    ).toEqual({ shouldShow: true, isGlobal: true });
  });
});

describe("resolvePanelFullWidth", () => {
  const inlineLayout = {
    isPanelOpen: true,
    isMaximized: false,
    isCompact: false,
    isChatDetached: false,
  };

  it("keeps the editor as a side panel in the default layout", () => {
    expect(resolvePanelFullWidth(inlineLayout)).toBe(false);
  });

  it("owns the row when the chat dock maximizes the editor", () => {
    expect(resolvePanelFullWidth({ ...inlineLayout, isMaximized: true })).toBe(
      true,
    );
  });

  it("owns the row when the narrow window overlays the chat", () => {
    expect(resolvePanelFullWidth({ ...inlineLayout, isCompact: true })).toBe(
      true,
    );
  });

  it("owns the row when chat lives in its own window", () => {
    expect(
      resolvePanelFullWidth({ ...inlineLayout, isChatDetached: true }),
    ).toBe(true);
  });

  it("leaves the row to the chat surface when the editor panel is closed", () => {
    expect(
      resolvePanelFullWidth({
        ...inlineLayout,
        isPanelOpen: false,
        isChatDetached: true,
        isMaximized: true,
      }),
    ).toBe(false);
  });
});

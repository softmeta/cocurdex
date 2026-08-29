import { describe, expect, it } from "vitest";

import {
  isEditorFullscreenLayout,
  shouldOpenDockWhenApplyingLayout,
} from "./chat-layout-preference";

describe("shouldOpenDockWhenApplyingLayout", () => {
  it("opens the dock when Settings picks float or pinned", () => {
    expect(shouldOpenDockWhenApplyingLayout("float", "settings")).toBe(true);
    expect(shouldOpenDockWhenApplyingLayout("pinned", "settings")).toBe(true);
  });

  it("preserves FAB when maximize restores last dock layout", () => {
    // Regression: exit fullscreen with chat collapsed to FAB, re-enter →
    // must not force-open a float/pinned rail (pinned lastDock felt like a
    // surprise pin).
    expect(shouldOpenDockWhenApplyingLayout("float", "maximize")).toBe(false);
    expect(shouldOpenDockWhenApplyingLayout("pinned", "maximize")).toBe(false);
  });

  it("preserves FAB when pin/unpin toggles dock layout", () => {
    expect(shouldOpenDockWhenApplyingLayout("float", "pin")).toBe(false);
    expect(shouldOpenDockWhenApplyingLayout("pinned", "pin")).toBe(false);
  });

  it("never opens the dock when leaving fullscreen layouts", () => {
    expect(shouldOpenDockWhenApplyingLayout("center", "settings")).toBe(false);
    expect(shouldOpenDockWhenApplyingLayout("center", "maximize")).toBe(false);
    expect(shouldOpenDockWhenApplyingLayout("center", "panel-close")).toBe(
      false,
    );
  });
});

describe("isEditorFullscreenLayout", () => {
  it("treats float and pinned as editor fullscreen", () => {
    expect(isEditorFullscreenLayout("float")).toBe(true);
    expect(isEditorFullscreenLayout("pinned")).toBe(true);
    expect(isEditorFullscreenLayout("center")).toBe(false);
  });
});

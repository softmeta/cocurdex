import { describe, expect, it } from "vitest";
import {
  GIT_DEFAULT_VIEW_MODE,
  GIT_MASTER_DETAIL_MIN_WIDTH,
  resolveViewModeForWidth,
  resolveViewModeOnResize,
} from "@/features/editor/git-view-mode";

describe("resolveViewModeForWidth", () => {
  it("uses the stacked list below the master-detail threshold", () => {
    expect(resolveViewModeForWidth(GIT_MASTER_DETAIL_MIN_WIDTH - 1)).toBe(
      "list",
    );
    expect(resolveViewModeForWidth(0)).toBe("list");
  });

  it("uses the tree at or above the threshold", () => {
    expect(resolveViewModeForWidth(GIT_MASTER_DETAIL_MIN_WIDTH)).toBe("tree");
    expect(resolveViewModeForWidth(GIT_MASTER_DETAIL_MIN_WIDTH + 400)).toBe(
      "tree",
    );
  });
});

describe("resolveViewModeOnResize", () => {
  it("leaves the view untouched when the width change is not a user drag", () => {
    // Regression: maximize / fullscreen / window resize must not auto-switch.
    // Only an active divider drag may change the mode.
    expect(
      resolveViewModeOnResize({
        current: null,
        width: GIT_MASTER_DETAIL_MIN_WIDTH + 999,
        isUserResizing: false,
      }),
    ).toBeNull();
    expect(
      resolveViewModeOnResize({
        current: "list",
        width: GIT_MASTER_DETAIL_MIN_WIDTH + 999,
        isUserResizing: false,
      }),
    ).toBe("list");
    expect(
      resolveViewModeOnResize({
        current: "tree",
        width: 100,
        isUserResizing: false,
      }),
    ).toBe("tree");
  });

  it("commits the width-based view while the user drags the divider", () => {
    expect(
      resolveViewModeOnResize({
        current: null,
        width: GIT_MASTER_DETAIL_MIN_WIDTH,
        isUserResizing: true,
      }),
    ).toBe("tree");
    expect(
      resolveViewModeOnResize({
        current: "tree",
        width: GIT_MASTER_DETAIL_MIN_WIDTH - 1,
        isUserResizing: true,
      }),
    ).toBe("list");
  });
});

describe("GIT_DEFAULT_VIEW_MODE", () => {
  it("defaults to the master-detail tree", () => {
    expect(GIT_DEFAULT_VIEW_MODE).toBe("tree");
  });
});

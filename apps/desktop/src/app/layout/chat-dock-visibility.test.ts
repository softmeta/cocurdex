import { describe, expect, it } from "vitest";

import {
  closedChatDockVisibility,
  isChatDockVisibility,
  nextChatDockVisibilityOnToggle,
  resolveChatDockVisibilityAfterHideFabChange,
} from "./chat-dock-geometry";

describe("isChatDockVisibility", () => {
  it("accepts the three dock surfaces", () => {
    expect(isChatDockVisibility("open")).toBe(true);
    expect(isChatDockVisibility("collapsed")).toBe(true);
    expect(isChatDockVisibility("hidden")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isChatDockVisibility(null)).toBe(false);
    expect(isChatDockVisibility("true")).toBe(false);
    expect(isChatDockVisibility("")).toBe(false);
  });
});

describe("closedChatDockVisibility", () => {
  it("shows the FAB when hide-fab is off", () => {
    expect(closedChatDockVisibility(false)).toBe("collapsed");
  });

  it("hides the FAB when hide-fab is on", () => {
    expect(closedChatDockVisibility(true)).toBe("hidden");
  });
});

describe("resolveChatDockVisibilityAfterHideFabChange", () => {
  it("collapses FAB when hide-fab turns on", () => {
    expect(resolveChatDockVisibilityAfterHideFabChange("collapsed", true)).toBe(
      "hidden",
    );
  });

  it("restores FAB when hide-fab turns off", () => {
    expect(resolveChatDockVisibilityAfterHideFabChange("hidden", false)).toBe(
      "collapsed",
    );
  });

  it("leaves open dock alone", () => {
    expect(resolveChatDockVisibilityAfterHideFabChange("open", true)).toBe(
      "open",
    );
    expect(resolveChatDockVisibilityAfterHideFabChange("open", false)).toBe(
      "open",
    );
  });
});

describe("nextChatDockVisibilityOnToggle", () => {
  it("closes an open dock to the FAB when hide-fab is off", () => {
    expect(nextChatDockVisibilityOnToggle("open", false)).toBe("collapsed");
  });

  it("closes an open dock fully when hide-fab is on", () => {
    expect(nextChatDockVisibilityOnToggle("open", true)).toBe("hidden");
  });

  it("opens chat from the FAB", () => {
    expect(nextChatDockVisibilityOnToggle("collapsed", false)).toBe("open");
    expect(nextChatDockVisibilityOnToggle("collapsed", true)).toBe("open");
  });

  it("restores the FAB after a one-shot hide from the close icon", () => {
    // Prefer restoring the launcher over jumping straight into open chat
    // (which would keep float/pinned layout and look like a surprise pin).
    expect(nextChatDockVisibilityOnToggle("hidden", false)).toBe("collapsed");
  });

  it("opens chat from preference-driven hidden (no FAB to restore)", () => {
    expect(nextChatDockVisibilityOnToggle("hidden", true)).toBe("open");
  });
});

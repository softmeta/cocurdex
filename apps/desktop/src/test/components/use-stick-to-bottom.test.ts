import { describe, expect, it } from "vitest";
import {
  isScrollNearBottom,
  isScrollNearTop,
  nextShouldStickToBottom,
  resolveJumpButton,
  STICK_TO_BOTTOM_THRESHOLD,
} from "@/components/chat";

describe("isScrollNearBottom", () => {
  it("is near bottom within the threshold", () => {
    expect(isScrollNearBottom(1000, 400, 600)).toBe(true);
    expect(
      isScrollNearBottom(1000, 400, 1000 - 400 - STICK_TO_BOTTOM_THRESHOLD),
    ).toBe(true);
  });

  it("is not near bottom past the threshold", () => {
    expect(
      isScrollNearBottom(1000, 400, 1000 - 400 - STICK_TO_BOTTOM_THRESHOLD - 1),
    ).toBe(false);
    expect(isScrollNearBottom(1000, 400, 0)).toBe(false);
  });
});

describe("isScrollNearTop", () => {
  it("is near the top within the threshold", () => {
    expect(isScrollNearTop(0)).toBe(true);
    expect(isScrollNearTop(STICK_TO_BOTTOM_THRESHOLD)).toBe(true);
  });

  it("is not near the top past the threshold", () => {
    expect(isScrollNearTop(STICK_TO_BOTTOM_THRESHOLD + 1)).toBe(false);
  });
});

describe("nextShouldStickToBottom", () => {
  it("re-locks when the viewport is near the bottom", () => {
    expect(
      nextShouldStickToBottom({
        currentlyStick: false,
        nearBottom: true,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(true);
  });

  it("unlocks on recent user scroll intent away from the bottom", () => {
    expect(
      nextShouldStickToBottom({
        currentlyStick: true,
        nearBottom: false,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(false);
  });

  it("preserves the current lock when there is no user intent", () => {
    expect(
      nextShouldStickToBottom({
        currentlyStick: true,
        nearBottom: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(true);
    expect(
      nextShouldStickToBottom({
        currentlyStick: false,
        nearBottom: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
  });

  it("does not re-lock near bottom during a jump-to-top animation", () => {
    // Smooth jump-to-top starts at the bottom edge; without suppress the lock
    // would re-arm and a concurrent stick would yank the view back down.
    expect(
      nextShouldStickToBottom({
        currentlyStick: false,
        nearBottom: true,
        hasRecentUserScrollIntent: false,
        suppressBottomRelock: true,
      }),
    ).toBe(false);
  });
});

describe("resolveJumpButton", () => {
  const base = {
    isReady: true,
    hasUserScrolled: true,
    isNearTop: false,
    isNearBottom: false,
    scrollDirection: "down" as const,
  };

  it("shows nothing until the view is ready", () => {
    expect(resolveJumpButton({ ...base, isReady: false })).toBeNull();
  });

  it("shows nothing when content fits (near both edges)", () => {
    expect(
      resolveJumpButton({ ...base, isNearTop: true, isNearBottom: true }),
    ).toBeNull();
  });

  it("offers 'latest' at the top", () => {
    expect(resolveJumpButton({ ...base, isNearTop: true })).toBe("latest");
  });

  it("offers 'top' at the bottom once the viewer has scrolled", () => {
    expect(resolveJumpButton({ ...base, isNearBottom: true })).toBe("top");
  });

  it("stays hidden at the bottom of a freshly opened conversation", () => {
    expect(
      resolveJumpButton({
        ...base,
        isNearBottom: true,
        hasUserScrolled: false,
      }),
    ).toBeNull();
  });

  it("mirrors the scroll direction in the middle", () => {
    expect(resolveJumpButton({ ...base, scrollDirection: "up" })).toBe("top");
    expect(resolveJumpButton({ ...base, scrollDirection: "down" })).toBe(
      "latest",
    );
  });
});

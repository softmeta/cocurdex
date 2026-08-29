import { describe, expect, it } from "vitest";
import { resolveStickToBottom } from "@/features/agent/view/chat-scroll";

const base = {
  autoScrollTarget: null,
  hasRecentUserScrollIntent: false,
  isAtBottom: true,
  isNearBottom: true,
  wasSticking: true,
};

describe("resolveStickToBottom", () => {
  it("keeps following while the viewer stays at the bottom", () => {
    expect(resolveStickToBottom(base)).toBe(true);
  });

  it("stops following a nudge inside the sticky band while scrolling", () => {
    // The regression: a scroll of a few dozen pixels is still "near bottom",
    // and re-arming there yanked the viewer back down on the next chunk.
    expect(
      resolveStickToBottom({
        ...base,
        hasRecentUserScrollIntent: true,
        isAtBottom: false,
      }),
    ).toBe(false);
  });

  it("re-arms when the viewer scrolls back to the very bottom", () => {
    expect(
      resolveStickToBottom({
        ...base,
        hasRecentUserScrollIntent: true,
        wasSticking: false,
      }),
    ).toBe(true);
  });

  it("stays detached after scrolling away once the intent window lapses", () => {
    expect(
      resolveStickToBottom({
        ...base,
        isAtBottom: false,
        isNearBottom: false,
        wasSticking: false,
      }),
    ).toBe(false);
  });

  it("never follows mid jump-to-top", () => {
    expect(resolveStickToBottom({ ...base, autoScrollTarget: "top" })).toBe(
      false,
    );
  });
});

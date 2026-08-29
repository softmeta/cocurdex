import { describe, expect, it } from "vitest";
import {
  getStickyUserMessageIdForConversationIndex,
  isViewportNearTop,
  resolveStickyUserMessage,
} from "@/features/agent/view/chat-scroll";

// resolveJumpButton lives in components/chat and is covered there; this file
// keeps agent-specific sticky / near-top behaviour.

describe("isViewportNearTop", () => {
  const nearTopViewport = (scrollTop: number) =>
    ({ scrollTop }) as HTMLDivElement;

  it("is near the top when scrolled within the threshold", () => {
    expect(isViewportNearTop(nearTopViewport(0))).toBe(true);
    expect(isViewportNearTop(nearTopViewport(96))).toBe(true);
  });

  it("is not near the top once scrolled past the threshold", () => {
    expect(isViewportNearTop(nearTopViewport(97))).toBe(false);
    expect(isViewportNearTop(nearTopViewport(2000))).toBe(false);
  });
});

describe("resolveStickyUserMessage", () => {
  it("pins the current section once its prompt header scrolls above the top", () => {
    // user-1 header is above the viewport top (negative), user-2 is still
    // below the activation offset — viewer is reading user-1's answer.
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: -240 },
        { id: "user-2", relativeTop: 600 },
      ],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1", pinned: true });
  });

  it("does not pin while the active prompt header is still visible near the top", () => {
    // user-1 header sits within [0, offset]; the real bubble is on screen, so
    // the overlay bar must stay hidden to avoid duplicating it.
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: 40 },
        { id: "user-2", relativeTop: 800 },
      ],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1", pinned: false });
  });

  it("selects the last prompt that has crossed the activation offset", () => {
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: -900 },
        { id: "user-2", relativeTop: -50 },
        { id: "user-3", relativeTop: 500 },
      ],
      "user-1",
    );

    expect(result).toEqual({ id: "user-2", pinned: true });
  });

  it("does not pin when scrolled above the first prompt", () => {
    const result = resolveStickyUserMessage(
      [{ id: "user-1", relativeTop: 300 }],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1", pinned: false });
  });

  it("falls back to the provided id when no candidates are mounted", () => {
    expect(resolveStickyUserMessage([], "user-2")).toEqual({
      id: "user-2",
      pinned: false,
    });
  });
});

describe("chat scroll state", () => {
  it("keeps sticky prompt selection on the current adjacent user message", () => {
    const conversationGroups = [
      { id: "conversation-user-1", prompt: { id: "user-1" } },
      { id: "conversation-user-2", prompt: { id: "user-2" } },
    ];

    expect(
      getStickyUserMessageIdForConversationIndex(conversationGroups, 1),
    ).toBe("user-2");
  });

  it("falls back to the nearest previous user message for non-prompt groups", () => {
    const conversationGroups = [
      { id: "conversation-system" },
      { id: "conversation-user-1", prompt: { id: "user-1" } },
      { id: "conversation-tool-only" },
    ];

    expect(
      getStickyUserMessageIdForConversationIndex(conversationGroups, 2),
    ).toBe("user-1");
  });
});

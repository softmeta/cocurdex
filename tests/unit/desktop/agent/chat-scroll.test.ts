import { describe, expect, it } from "vitest";
import {
  getStickyUserMessageIdForConversationIndex,
  getTranscriptContentHeight,
  isViewportAtBottom,
  isViewportNearTop,
  resolveStickyUserMessage,
} from "@/features/agent/view/chat-scroll";

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
  it("selects the current section once its prompt header scrolls above the top", () => {
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: -240 },
        { id: "user-2", relativeTop: 600 },
      ],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1" });
  });

  it("selects the active prompt while its header is still visible near the top", () => {
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: 40 },
        { id: "user-2", relativeTop: 800 },
      ],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1" });
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

    expect(result).toEqual({ id: "user-2" });
  });

  it("falls back to the first prompt when scrolled above it", () => {
    const result = resolveStickyUserMessage(
      [{ id: "user-1", relativeTop: 300 }],
      "user-1",
    );

    expect(result).toEqual({ id: "user-1" });
  });

  it("falls back to the provided id when no candidates are mounted", () => {
    expect(resolveStickyUserMessage([], "user-2")).toEqual({
      id: "user-2",
    });
  });

  it("selects the last prompt at the end even when its header is below the activation offset", () => {
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: -900 },
        { id: "user-2", relativeTop: -50 },
        { id: "user-3", relativeTop: 200 },
      ],
      "user-1",
      { atEnd: true, lastId: "user-3" },
    );

    expect(result).toEqual({ id: "user-3" });
  });

  it("selects lastId at the end when the last prompt is not in the candidate window", () => {
    const result = resolveStickyUserMessage(
      [
        { id: "user-1", relativeTop: -40 },
        { id: "user-2", relativeTop: 120 },
      ],
      "user-1",
      { atEnd: true, lastId: "user-3" },
    );

    expect(result).toEqual({ id: "user-3" });
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

describe("transcript content boundary", () => {
  it("ignores anchor space below the last visible content", () => {
    const end = document.createElement("div");
    end.setAttribute("data-transcript-content-end", "");
    const viewport = document.createElement("div");
    viewport.append(end);
    Object.defineProperties(viewport, {
      scrollHeight: { value: 2000 },
      clientHeight: { value: 600 },
      scrollTop: { value: 1000 },
    });
    viewport.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    end.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect;
    expect(getTranscriptContentHeight(viewport)).toBe(1300);
    expect(isViewportAtBottom(viewport)).toBe(true);
    end.getBoundingClientRect = () => ({ bottom: 900 }) as DOMRect;
    expect(isViewportAtBottom(viewport)).toBe(false);
  });
});

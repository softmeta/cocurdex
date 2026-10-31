import { checkDeck, resolveSlide } from "@cocurdex/deck";
import type { DeckContent, Slide } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function deckOf(slides: Slide[]): DeckContent {
  return {
    version: 1,
    size: { width: 1280, height: 720 },
    theme: "default",
    slides,
  };
}

function bulletSlide(
  id: string,
  count: number,
  text = "A reasonably short point",
): Slide {
  return {
    id,
    layout: "title-content",
    slots: {
      title: { kind: "text", paragraphs: [{ runs: [{ text: "Title" }] }] },
      body: {
        kind: "text",
        paragraphs: Array.from({ length: count }, () => ({
          runs: [{ text }],
          list: "bullet" as const,
        })),
      },
    },
    elements: [],
    notes: "",
  };
}

function bodyFontSize(slide: Slide) {
  const item = resolveSlide(slide, deckOf([slide])).items.find(
    (entry) => entry.source.kind === "slot" && entry.source.slot === "body",
  );
  return item && item.kind === "text" ? item.fontSize : null;
}

describe("checkDeck", () => {
  it("reports nothing for content that fits", () => {
    expect(checkDeck(deckOf([bulletSlide("s1", 4)]))).toEqual([]);
  });

  it("shrinks long bodies before reporting overflow", () => {
    const short = bodyFontSize(bulletSlide("s1", 3)) ?? 0;
    const long = bodyFontSize(bulletSlide("s1", 16)) ?? 0;

    expect(long).toBeLessThan(short);
    expect(checkDeck(deckOf([bulletSlide("s1", 16)]))).toEqual([]);
  });

  it("flags text that cannot fit at the smallest size", () => {
    const issues = checkDeck(deckOf([bulletSlide("s1", 80, "x ".repeat(60))]));

    expect(issues).toEqual([
      expect.objectContaining({
        slideId: "s1",
        kind: "overflow",
        target: "slot:body",
      }),
    ]);
  });

  it("flags empty slides and slots the layout does not show", () => {
    const hidden: Slide = {
      id: "s2",
      layout: "title-only",
      slots: {
        title: { kind: "text", paragraphs: [{ runs: [{ text: "T" }] }] },
        body: { kind: "text", paragraphs: [{ runs: [{ text: "lost" }] }] },
      },
      elements: [],
      notes: "",
    };
    const empty: Slide = {
      id: "s3",
      layout: "blank",
      slots: {},
      elements: [],
      notes: "",
    };

    expect(
      checkDeck(deckOf([hidden, empty])).map((issue) => [
        issue.slideIndex,
        issue.kind,
      ]),
    ).toEqual([
      [0, "unknown-slot"],
      [1, "empty-slide"],
    ]);
  });
});

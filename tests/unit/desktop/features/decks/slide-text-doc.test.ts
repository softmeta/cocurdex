import type { TextParagraph } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  docToParagraphs,
  paragraphsToDoc,
} from "@/features/decks/slide-editor/slide-text-doc";

const roundTrip = (paragraphs: TextParagraph[]) =>
  docToParagraphs(paragraphsToDoc(paragraphs));

describe("slide text documents", () => {
  it("keeps plain paragraphs, alignment, and every run mark", () => {
    const paragraphs: TextParagraph[] = [
      {
        align: "center",
        runs: [
          { text: "Plain " },
          { text: "bold", bold: true, italic: true },
          { text: " under", underline: true, strike: true },
          { text: " code", code: true },
          { text: " link", link: "https://example.invalid/a" },
          { text: " accent", color: "accent" },
        ],
      },
      { runs: [] },
    ];
    expect(roundTrip(paragraphs)).toEqual(paragraphs);
  });

  it("keeps nested and mixed lists with their levels", () => {
    const paragraphs: TextParagraph[] = [
      { runs: [{ text: "Intro" }] },
      { runs: [{ text: "a" }], list: "bullet", level: 0 },
      { runs: [{ text: "a.1" }], list: "number", level: 1 },
      { runs: [{ text: "a.2" }], list: "number", level: 1 },
      { runs: [{ text: "a.2.x" }], list: "bullet", level: 2 },
      { runs: [{ text: "b" }], list: "bullet", level: 0 },
      { runs: [{ text: "one" }], list: "number", level: 0 },
      { runs: [{ text: "Outro" }] },
    ];
    expect(roundTrip(paragraphs)).toEqual(paragraphs);
  });

  it("nests a list that starts deeper than its parent under one item", () => {
    expect(
      roundTrip([{ runs: [{ text: "deep" }], list: "bullet", level: 2 }]),
    ).toEqual([{ runs: [{ text: "deep" }], list: "bullet", level: 0 }]);
  });

  it("gives an empty document one empty paragraph and back", () => {
    expect(paragraphsToDoc([])).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(
      docToParagraphs({ type: "doc", content: [{ type: "paragraph" }] }),
    ).toEqual([{ runs: [] }]);
  });

  it("caps list depth at the deck limit", () => {
    const deep = (level: number): TextParagraph => ({
      runs: [{ text: `l${level}` }],
      list: "bullet",
      level,
    });
    const doc = paragraphsToDoc([0, 1, 2, 3, 4].map(deep));
    const nested = {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "l5" }] },
          ],
        },
      ],
    };
    const lastItem = (node: typeof doc): typeof doc => {
      const item = node.content?.at(-1);
      return item?.content?.at(-1)?.type?.endsWith("List")
        ? lastItem(item.content.at(-1) as typeof doc)
        : (item as typeof doc);
    };
    lastItem(doc.content?.[0] as typeof doc).content?.push(nested);
    expect(docToParagraphs(doc).at(-1)).toEqual({
      runs: [{ text: "l5" }],
      list: "bullet",
      level: 4,
    });
  });
});

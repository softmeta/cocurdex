import type { TextParagraph } from "@cocurdex/shared";
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  docToParagraphs,
  paragraphsToDoc,
} from "@/features/decks/slide-editor/slide-text-doc";
import { slideTextExtensions } from "@/features/decks/slide-editor/slide-text-extensions";

describe("slide text editor schema", () => {
  it("keeps every run mark through a real editor", () => {
    const paragraphs: TextParagraph[] = [
      {
        align: "right",
        runs: [
          { text: "bold", bold: true },
          { text: " italic", italic: true },
          { text: " under", underline: true },
          { text: " strike", strike: true },
          { text: " code", code: true },
          { text: " link", link: "https://example.invalid/a" },
          { text: " accent", color: "accent" },
        ],
      },
      { runs: [{ text: "item" }], list: "bullet", level: 0 },
    ];
    const editor = new Editor({
      extensions: slideTextExtensions(""),
      content: paragraphsToDoc(paragraphs),
    });
    expect(docToParagraphs(editor.getJSON())).toEqual(paragraphs);
    editor.destroy();
  });
});

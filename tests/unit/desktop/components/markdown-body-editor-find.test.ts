import { getNoteDocSchema, parseNoteMarkdown } from "@cocurdex/note-doc";
import { describe, expect, it } from "vitest";
import { findTextMatches } from "@/components/markdown-body-editor/body-find";

function docOf(markdown: string) {
  const schema = getNoteDocSchema();
  return schema.nodeFromJSON(parseNoteMarkdown(markdown));
}

function matchedText(markdown: string, query: string): string[] {
  const doc = docOf(markdown);
  return findTextMatches(doc, query).map(({ from, to }) =>
    doc.textBetween(from, to),
  );
}

describe("findTextMatches", () => {
  it("maps matches to document positions across marks, blocks, and case", () => {
    const markdown = [
      "Learn **more** about Learning",
      "",
      "- item with `learn` code",
    ].join("\n");

    expect(matchedText(markdown, "learn")).toEqual(["Learn", "Learn", "learn"]);
    expect(matchedText(markdown, "e ab")).toEqual(["e ab"]);
  });

  it("keeps positions after an inline image and treats the query literally", () => {
    const markdown = "a ![x](img.png) b.c bxc";

    expect(matchedText(markdown, "b.c")).toEqual(["b.c"]);
  });

  it("returns nothing for an empty query", () => {
    expect(findTextMatches(docOf("text"), "")).toEqual([]);
  });
});

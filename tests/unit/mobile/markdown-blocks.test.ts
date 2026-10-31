import { splitMarkdownBlocks } from "@cocurdex/mobile/internal/markdown/markdown-blocks";
import { describe, expect, it } from "vitest";

const DOCUMENT = [
  "# Plan",
  "",
  "First paragraph",
  "continues here.",
  "",
  "- one",
  "",
  "- two",
  "  still two",
  "",
  "1. first",
  "2. second",
  "",
  "```ts",
  "const a = 1;",
  "",
  "const b = 2;",
  "```",
  "",
  "> quoted",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "Done.",
].join("\n");

describe("splitMarkdownBlocks", () => {
  it("splits top-level blocks at blank lines", () => {
    expect(splitMarkdownBlocks(DOCUMENT).map((block) => block.line)).toEqual([
      0, 2, 5, 13, 19, 21, 25,
    ]);
  });

  it("keeps loose list items and indented continuations in one block", () => {
    const list = splitMarkdownBlocks(DOCUMENT)[2];
    expect(list?.text).toBe(
      "- one\n\n- two\n  still two\n\n1. first\n2. second\n",
    );
  });

  it("never splits inside a fenced code block", () => {
    const code = splitMarkdownBlocks(DOCUMENT)[3];
    expect(code?.text).toBe("```ts\nconst a = 1;\n\nconst b = 2;\n```\n");
  });

  it("keeps an unclosed fence open to the end", () => {
    expect(splitMarkdownBlocks("Intro\n\n```\na\n\nb")).toEqual([
      { line: 0, text: "Intro\n" },
      { line: 2, text: "```\na\n\nb" },
    ]);
  });

  it("returns every character of the input in order", () => {
    const joined = splitMarkdownBlocks(DOCUMENT)
      .map((block) => block.text)
      .join("\n");
    expect(joined).toBe(DOCUMENT);
  });

  it("never moves an earlier block boundary as text streams in", () => {
    const full = splitMarkdownBlocks(DOCUMENT);
    for (let end = 1; end <= DOCUMENT.length; end += 1) {
      const partial = splitMarkdownBlocks(DOCUMENT.slice(0, end));
      const settled = partial.slice(0, -1);
      expect(settled).toEqual(full.slice(0, settled.length));
      const last = partial.at(-1);
      const counterpart = full[partial.length - 1];
      expect(last?.line).toBe(counterpart?.line);
    }
  });
});

import { describe, expect, it } from "vitest";
import { looksLikeMarkdown } from "@/components/markdown-body-editor/markdown-paste";

describe("looksLikeMarkdown", () => {
  it.each([
    ["# Bug: jump to top", "heading"],
    ["intro\n\n## Cause", "later heading"],
    ["- first\n- second", "bullet list"],
    ["1. step\n2. step", "ordered list"],
    ["> quoted", "blockquote"],
    ["```ts\nconst a = 1;\n```", "fenced code"],
    ["| a | b |\n|---|---|\n| 1 | 2 |", "table"],
    ["call `scrollTo` here", "inline code"],
    ["this is **bold**", "strong"],
    ["see [docs](https://example.invalid)", "link"],
    ["---", "thematic break"],
  ])("detects %j (%s)", (text) => {
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it.each([
    ["just a sentence"],
    ["two lines\nof plain prose"],
    ["C# and F# are languages"],
    ["price is 3*4 = 12"],
    ["2026-10-15 meeting"],
    ["#hashtag without space"],
  ])("keeps %j as plain text", (text) => {
    expect(looksLikeMarkdown(text)).toBe(false);
  });
});

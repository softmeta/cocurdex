import { splitMermaidBlocks } from "@cocurdex/mobile/internal/markdown/markdown-segments";
import { streamingBlocks } from "@cocurdex/mobile/internal/markdown/streaming-blocks";
import { describe, expect, it } from "vitest";

function blocks(markdown: string, live: boolean, split = true) {
  return streamingBlocks(splitMermaidBlocks(markdown), { live, split });
}

describe("streamingBlocks", () => {
  it("closes unfinished emphasis in the block still streaming", () => {
    expect(blocks("Done **soon\n\nStill **writ", true)).toEqual([
      { kind: "markdown", key: "markdown-0", text: "Done **soon\n" },
      { kind: "markdown", key: "markdown-2", text: "Still **writ**" },
    ]);
  });

  it("shows a half-written link as text instead of a dead link", () => {
    const [block] = blocks("See [the docs](https://exa", true);
    expect(block).toMatchObject({ kind: "markdown" });
    expect(block?.kind === "markdown" && block.text).not.toContain(
      "streamdown:",
    );
  });

  it("leaves finished messages untouched", () => {
    expect(blocks("Still **writ", false)).toEqual([
      { kind: "markdown", key: "markdown-0", text: "Still **writ" },
    ]);
  });

  it("keeps a message that arrived finished in one block", () => {
    expect(blocks("One\n\nTwo", false, false)).toEqual([
      { kind: "markdown", key: "markdown-0", text: "One\n\nTwo" },
    ]);
  });

  it("keys blocks after a diagram by their line in the message", () => {
    const markdown = "Intro\n\n```mermaid\ngraph TD\n```\n\nAfter";
    expect(blocks(markdown, false).map((block) => block.key)).toEqual([
      "markdown-0",
      "mermaid-2",
      "markdown-5",
    ]);
  });
});

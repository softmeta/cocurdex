import { splitMermaidBlocks } from "@cocurdex/mobile/internal/markdown/markdown-segments";
import { describe, expect, it } from "vitest";

describe("splitMermaidBlocks", () => {
  it("keeps markdown without diagrams as one segment", () => {
    expect(splitMermaidBlocks("# Title\n\n```ts\nconst a = 1;\n```")).toEqual([
      {
        kind: "markdown",
        line: 0,
        text: "# Title\n\n```ts\nconst a = 1;\n```",
      },
    ]);
  });

  it("lifts closed mermaid fences out between the prose around them", () => {
    expect(
      splitMermaidBlocks(
        "Flow:\r\n\r\n```mermaid\r\ngraph TD\r\n  A --> B\r\n```\r\n\r\nDone.",
      ),
    ).toEqual([
      { kind: "markdown", line: 0, text: "Flow:\n" },
      { kind: "mermaid", line: 2, source: "graph TD\n  A --> B" },
      { kind: "markdown", line: 6, text: "\nDone." },
    ]);
  });

  it("accepts tilde and longer fences", () => {
    expect(splitMermaidBlocks("~~~~ Mermaid\npie\n~~~~")).toEqual([
      { kind: "mermaid", line: 0, source: "pie" },
    ]);
  });

  it("leaves a fence that is still streaming as markdown", () => {
    expect(splitMermaidBlocks("```mermaid\ngraph TD\n  A -->")).toEqual([
      { kind: "markdown", line: 0, text: "```mermaid\ngraph TD\n  A -->" },
    ]);
  });
});

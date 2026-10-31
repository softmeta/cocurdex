import { splitDocImages } from "@cocurdex/mobile/internal/markdown/doc-image-segments";
import { splitMermaidBlocks } from "@cocurdex/mobile/internal/markdown/markdown-segments";
import { streamingBlocks } from "@cocurdex/mobile/internal/markdown/streaming-blocks";
import { describe, expect, it } from "vitest";

const file = "3f1c2a9e-4b7d-4e2a-9c1f-0a1b2c3d4e5f.png";
const image = `![checkout](cocurdex://image/${file})`;

function split(markdown: string) {
  return splitDocImages(splitMermaidBlocks(markdown));
}

describe("doc image segments", () => {
  it("lifts a stored image out of the prose around it", () => {
    expect(split(`Repro steps\n\n${image}\n\nExpected total`)).toEqual([
      { kind: "markdown", line: 0, text: "Repro steps\n" },
      { kind: "image", line: 2, column: 0, fileName: file, alt: "checkout" },
      { kind: "markdown", line: 3, text: "\nExpected total" },
    ]);
  });

  it("splits an inline image and keeps text on both sides", () => {
    const segments = split(`See ${image} here`);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "markdown",
      "image",
      "markdown",
    ]);
    expect(segments[2]).toMatchObject({ text: " here" });
    const keys = streamingBlocks(segments, { live: true, split: true }).map(
      (block) => block.key,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves images inside code fences and remote images as markdown", () => {
    const markdown = `\`\`\`md\n${image}\n\`\`\`\n![a](https://example.invalid/a.png)`;
    expect(split(markdown)).toEqual([
      { kind: "markdown", line: 0, text: markdown },
    ]);
  });
});

import {
  docImageMarkdown,
  findDocImages,
  parseDocImageUri,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const file = "3f1c2a9e-4b7d-4e2a-9c1f-0a1b2c3d4e5f.png";

describe("doc image references", () => {
  it("accepts only stored image file names", () => {
    expect(parseDocImageUri(`cocurdex://image/${file}`)).toBe(file);
    expect(parseDocImageUri("cocurdex://image/../cocurdex.sqlite")).toBeNull();
    expect(parseDocImageUri("cocurdex://image/a.svg")).toBeNull();
    expect(parseDocImageUri("cocurdex://note/n1")).toBeNull();
    expect(parseDocImageUri("https://example.invalid/a.png")).toBeNull();
  });

  it("round-trips alt text with brackets through markdown", () => {
    const markdown = docImageMarkdown(file, "Cart [v2]\nscreenshot");
    expect(markdown).toBe(
      `![Cart \\[v2\\] screenshot](cocurdex://image/${file})`,
    );
    expect(findDocImages(`See ${markdown}.`)).toEqual([
      {
        index: 4,
        length: markdown.length,
        alt: "Cart [v2] screenshot",
        fileName: file,
      },
    ]);
  });

  it("ignores ordinary images and invalid references", () => {
    expect(
      findDocImages(
        "![a](https://example.invalid/a.png) ![b](cocurdex://image/x.svg)",
      ),
    ).toEqual([]);
  });

  it("scans unclosed image openers in linear time", () => {
    const hostile = `${"![".repeat(50_000)}\\`;
    const started = performance.now();
    expect(findDocImages(hostile)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

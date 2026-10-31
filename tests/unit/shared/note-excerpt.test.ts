import { noteExcerpt } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("noteExcerpt", () => {
  it("reads the first prose after headings, code, and markup", () => {
    expect(
      noteExcerpt(
        [
          "# Title",
          "",
          "```ts",
          "const hidden = true;",
          "```",
          "> - [x] Ship `codes` with __care__ and [[Pricing|price rules]]",
        ].join("\r\n"),
      ),
    ).toBe("Ship codes with care and price rules");
  });

  it("returns nothing for a body without prose", () => {
    expect(noteExcerpt("")).toBeNull();
    expect(noteExcerpt("## Only a heading\n\n---")).toBeNull();
  });

  it("cuts long prose with an ellipsis", () => {
    const excerpt = noteExcerpt("word ".repeat(100)) ?? "";
    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("reads repeated unclosed image and link markup in linear time", () => {
    const line = `Intro ${"![\\".repeat(20_000)} ${"![](".repeat(20_000)} ${"[[a|".repeat(20_000)}`;
    const started = performance.now();
    expect(noteExcerpt(line)?.startsWith("Intro ![")).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("keeps the text of links and images inside brackets", () => {
    expect(
      noteExcerpt(
        "See [docs](https://example.invalid) and ![logo](a.png) [x [y](z)",
      ),
    ).toBe("See docs and logo [x y");
  });
});

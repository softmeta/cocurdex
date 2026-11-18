import {
  findInlineMath,
  parseNoteMarkdown,
  serializeNoteMarkdown,
} from "@cocurdex/note-doc/internal/index";
import { describe, expect, it } from "vitest";

const roundTrip = (markdown: string) =>
  serializeNoteMarkdown(parseNoteMarkdown(markdown));

describe("inline math", () => {
  it("finds TeX between single dollars", () => {
    expect(findInlineMath("mass $E = mc^2$ and $x$.")).toEqual([
      { from: 5, to: 15, tex: "E = mc^2" },
      { from: 20, to: 23, tex: "x" },
    ]);
  });

  it("leaves prices, escaped dollars, and display delimiters as text", () => {
    expect(findInlineMath("costs $5 and $10 today")).toEqual([]);
    expect(findInlineMath("a $ b $ c")).toEqual([]);
    expect(findInlineMath(String.raw`\$x\$ stays`)).toEqual([]);
    expect(findInlineMath("$$x$$")).toEqual([]);
    expect(findInlineMath("from $1 to $2")).toEqual([]);
  });
});

describe("math markdown", () => {
  it("keeps TeX subscripts out of emphasis", () => {
    expect(roundTrip("Let $x_i + y_j$ be _the_ sum.")).toBe(
      "Let $x_i + y_j$ be *the* sum.",
    );
  });

  it("keeps TeX commands and comparisons verbatim across saves", () => {
    const markdown = String.raw`Ratio $\frac{a_1}{b} < c \& d$ holds.`;

    expect(roundTrip(markdown)).toBe(markdown);
    expect(roundTrip(roundTrip(markdown))).toBe(markdown);
  });

  it("stores a display formula as a math code block", () => {
    const doc = parseNoteMarkdown(
      "Before\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter",
    );

    expect(doc.content?.[1]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "math" },
      content: [{ type: "text", text: "\\int_0^1 x\\,dx" }],
    });
    expect(roundTrip("$$x^2$$")).toBe("```math\nx^2\n```");
  });

  it("round-trips mermaid and math fences unchanged", () => {
    const markdown =
      "```mermaid\ngraph TD\n  A --> B\n```\n\n```math\na^2\n```";

    expect(roundTrip(markdown)).toBe(markdown);
  });
});

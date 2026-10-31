import { parseDeckContent } from "@cocurdex/deck";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import { describe, expect, it } from "vitest";

function sequentialIds() {
  let next = 0;
  return () => `id-${next++}`;
}

function compile(markdown: string) {
  return compileDeckMarkdown(markdown, sequentialIds());
}

function slotText(slot: unknown): string {
  if (!slot || typeof slot !== "object" || !("paragraphs" in slot)) return "";
  const paragraphs = slot.paragraphs as { runs: { text: string }[] }[];
  return paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
}

describe("compileDeckMarkdown", () => {
  it("lays out title slides as cover, section, and closing by position", () => {
    const { content, title } = compile(
      "# Launch\nOctober\n\n---\n\n# Part two\n\n---\n\n## Agenda\n- One\n\n---\n\n# Thanks",
    );

    expect(content.slides.map((slide) => slide.layout)).toEqual([
      "cover",
      "section",
      "title-content",
      "closing",
    ]);
    expect(title).toBe("Launch");
    expect(slotText(content.slides[0]?.slots.subtitle)).toBe("October");
  });

  it("treats a bare --- line under text as a slide break, not a heading underline", () => {
    const { content } = compile(
      "## One\n- a\n---\n## Two\nText\n---\n```\n---\n```",
    );

    expect(content.slides).toHaveLength(3);
    expect(slotText(content.slides[1]?.slots.body)).toBe("Text");
    expect(slotText(content.slides[2]?.slots.body)).toBe("---");
  });

  it("keeps nested list levels and inline marks", () => {
    const { content } = compile(
      "## Plan\n- **Ship** it\n  - then `measure`\n1. First",
    );
    const body = content.slides[0]?.slots.body;

    expect(body?.kind).toBe("text");
    if (body?.kind !== "text") return;
    expect(
      body.paragraphs.map((paragraph) => [
        paragraph.list,
        paragraph.level ?? 0,
      ]),
    ).toEqual([
      ["bullet", 0],
      ["bullet", 1],
      ["number", 0],
    ]);
    expect(body.paragraphs[0]?.runs[0]).toEqual({ text: "Ship", bold: true });
    expect(body.paragraphs[1]?.runs[1]).toEqual({
      text: "measure",
      code: true,
    });
  });

  it("turns two third-level sections into a two-column slide", () => {
    const { content } = compile(
      "## Compare\n### Before\n- Slow\n### After\n- Fast",
    );
    const [slide] = content.slides;

    expect(slide?.layout).toBe("two-content");
    expect(slotText(slide?.slots.left)).toBe("Before\nSlow");
    expect(slotText(slide?.slots.right)).toBe("After\nFast");
  });

  it("puts a table in the body and the surrounding text in a caption above it", () => {
    const { content } = compile(
      "## Results\nMeasured on CI.\n\n| Metric | Value |\n| --- | --- |\n| p95 | 120 ms |",
    );
    const [slide] = content.slides;
    const body = slide?.slots.body;

    expect(slide?.layout).toBe("title-content");
    expect(body?.kind).toBe("table");
    if (body?.kind !== "table") return;
    expect(body.table.header).toBe(true);
    expect(body.table.rows).toHaveLength(2);
    const caption = slide?.elements[0];
    expect(caption?.kind).toBe("text");
    expect(
      caption && "frame" in caption && slide?.slotFrames?.body,
    ).toBeTruthy();
    expect(caption?.frame.y).toBeLessThan(slide?.slotFrames?.body?.y ?? 0);
  });

  it("moves everything after a notes marker into speaker notes", () => {
    const { content } = compile(
      "## Pitch\n- Point\n\nNotes: Say this.\n\nAnd this.",
    );
    const [slide] = content.slides;

    expect(slide?.notes).toBe("Say this.\nAnd this.");
    expect(slotText(slide?.slots.body)).toBe("Point");
  });

  it("drops images with a warning that names the slide", () => {
    const { content, warnings } = compile(
      "## A\n- x\n\n---\n\n## B\n![chart](chart.png)",
    );

    expect(content.slides[1]?.layout).toBe("title-only");
    expect(warnings).toEqual([
      { slideIndex: 1, message: expect.stringContaining("chart.png") },
    ]);
  });

  it("produces content that passes the deck schema", () => {
    const { content } = compile(
      "# T\n\n---\n\n## L\n- [x] done\n- [ ] open\n- [rel](./relative)\n\n```\ncode\n```\n\n> quote",
    );

    expect(() => parseDeckContent(content)).not.toThrow();
  });
});

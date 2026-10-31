import { applyDeckOps } from "@cocurdex/deck/edit";
import type { DeckContent, Slide, TextParagraph } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function text(value: string): TextParagraph[] {
  return [{ runs: [{ text: value }] }];
}

function slide(id: string, overrides: Partial<Slide> = {}): Slide {
  return {
    id,
    layout: "title-content",
    slots: {
      title: { kind: "text", paragraphs: text(`Title ${id}`) },
      body: { kind: "text", paragraphs: text(`Body ${id}`) },
    },
    elements: [],
    notes: "",
    ...overrides,
  };
}

function deckOf(...slides: Slide[]): DeckContent {
  return {
    version: 1,
    size: { width: 1280, height: 720 },
    theme: "default",
    slides,
  };
}

function sequentialIds() {
  let next = 0;
  return () => {
    next += 1;
    return `new-${next}`;
  };
}

const ids = (deck: DeckContent) => deck.slides.map((item) => item.id);

describe("applyDeckOps slide management", () => {
  it("adds an empty slide with the requested layout at an index", () => {
    const { content } = applyDeckOps(
      deckOf(slide("a"), slide("b")),
      [{ op: "addSlide", layout: "section", index: 1 }],
      sequentialIds(),
    );
    expect(ids(content)).toEqual(["a", "new-1", "b"]);
    expect(content.slides[1]).toEqual({
      id: "new-1",
      layout: "section",
      slots: {},
      elements: [],
      notes: "",
    });
  });

  it("appends when no index is given and clamps out-of-range indexes", () => {
    const { content } = applyDeckOps(
      deckOf(slide("a")),
      [
        { op: "addSlide", layout: "blank" },
        { op: "addSlide", layout: "blank", index: 99 },
        { op: "addSlide", layout: "blank", index: -4 },
      ],
      sequentialIds(),
    );
    expect(ids(content)).toEqual(["new-3", "a", "new-1", "new-2"]);
  });

  it("duplicates a slide after itself with fresh slide and element ids", () => {
    const original = slide("a", {
      elements: [
        {
          id: "shape-1",
          kind: "shape",
          frame: { x: 0, y: 0, w: 10, h: 10 },
          shape: "rect",
          fill: "accent",
        },
      ],
      notes: "Keep me",
    });
    const { content } = applyDeckOps(
      deckOf(original, slide("b")),
      [{ op: "duplicateSlide", slideId: "a" }],
      sequentialIds(),
    );
    expect(ids(content)).toEqual(["a", "new-1", "b"]);
    const copy = content.slides[1];
    expect(copy?.notes).toBe("Keep me");
    expect(copy?.slots).toEqual(original.slots);
    expect(copy?.elements.map((element) => element.id)).toEqual(["new-2"]);
  });

  it("deletes and moves slides by id", () => {
    const { content } = applyDeckOps(
      deckOf(slide("a"), slide("b"), slide("c"), slide("d")),
      [
        { op: "deleteSlide", slideId: "b" },
        { op: "moveSlide", slideId: "a", index: 2 },
      ],
      sequentialIds(),
    );
    expect(ids(content)).toEqual(["c", "d", "a"]);
  });

  it("rejects an unknown slide id without changing the input", () => {
    const deck = deckOf(slide("a"));
    expect(() =>
      applyDeckOps(deck, [{ op: "deleteSlide", slideId: "zz" }]),
    ).toThrow(/Slide not found: zz/);
    expect(ids(deck)).toEqual(["a"]);
  });

  it("inserts slides compiled from Markdown and reports their warnings", () => {
    const { content, warnings } = applyDeckOps(
      deckOf(slide("a"), slide("b")),
      [
        {
          op: "insertSlides",
          index: 1,
          markdown:
            "## Risks\n\n- Latency\n\n---\n\n## Image\n\n![x](https://example.invalid/x.png)",
        },
      ],
      sequentialIds(),
    );
    expect(content.slides.map((item) => item.layout)).toEqual([
      "title-content",
      "title-content",
      "title-only",
      "title-content",
    ]);
    expect(ids(content)[0]).toBe("a");
    expect(ids(content)[3]).toBe("b");
    expect(warnings).toEqual([
      { slideIndex: 2, message: expect.stringContaining("x.png") },
    ]);
  });
});

describe("applyDeckOps text, notes, and theme", () => {
  it("replaces a slot's paragraphs and creates the slot when the layout has it", () => {
    const { content } = applyDeckOps(deckOf(slide("a", { slots: {} })), [
      {
        op: "setText",
        slideId: "a",
        target: "slot:title",
        paragraphs: text("Fresh"),
      },
    ]);
    expect(content.slides[0]?.slots.title).toEqual({
      kind: "text",
      paragraphs: text("Fresh"),
    });
  });

  it("accepts Markdown for text with lists and inline marks", () => {
    const { content } = applyDeckOps(deckOf(slide("a")), [
      {
        op: "setText",
        slideId: "a",
        target: "slot:body",
        markdown: "Intro **bold**\n\n- one\n  - nested",
      },
    ]);
    expect(content.slides[0]?.slots.body).toEqual({
      kind: "text",
      paragraphs: [
        { runs: [{ text: "Intro " }, { text: "bold", bold: true }] },
        { runs: [{ text: "one" }], list: "bullet", level: 0 },
        { runs: [{ text: "nested" }], list: "bullet", level: 1 },
      ],
    });
  });

  it("edits a free text element and refuses non-text targets", () => {
    const deck = deckOf(
      slide("a", {
        elements: [
          {
            id: "caption",
            kind: "text",
            role: "caption",
            frame: { x: 0, y: 0, w: 100, h: 40 },
            paragraphs: text("Old"),
          },
          {
            id: "dot",
            kind: "shape",
            shape: "ellipse",
            fill: "accent",
            frame: { x: 0, y: 0, w: 10, h: 10 },
          },
        ],
      }),
    );
    const { content } = applyDeckOps(deck, [
      {
        op: "setText",
        slideId: "a",
        target: "element:caption",
        paragraphs: text("New"),
      },
    ]);
    expect(content.slides[0]?.elements[0]).toMatchObject({
      paragraphs: text("New"),
    });
    expect(() =>
      applyDeckOps(deck, [
        {
          op: "setText",
          slideId: "a",
          target: "element:dot",
          paragraphs: text("x"),
        },
      ]),
    ).toThrow(/not a text element/);
    expect(() =>
      applyDeckOps(deck, [
        {
          op: "setText",
          slideId: "a",
          target: "slot:left",
          paragraphs: text("x"),
        },
      ]),
    ).toThrow(/has no "left" slot/);
  });

  it("sets notes and theme", () => {
    const { content } = applyDeckOps(deckOf(slide("a")), [
      { op: "setNotes", slideId: "a", notes: "Say hello" },
      { op: "setTheme", theme: "midnight" },
    ]);
    expect(content.slides[0]?.notes).toBe("Say hello");
    expect(content.theme).toBe("midnight");
  });
});

describe("applyDeckOps layout changes keep every piece of content", () => {
  it("moves a single body into the left column and back", () => {
    const toColumns = applyDeckOps(deckOf(slide("a")), [
      { op: "setLayout", slideId: "a", layout: "two-content" },
    ]).content;
    expect(toColumns.slides[0]?.slots).toEqual({
      title: { kind: "text", paragraphs: text("Title a") },
      left: { kind: "text", paragraphs: text("Body a") },
    });
    const back = applyDeckOps(toColumns, [
      { op: "setLayout", slideId: "a", layout: "title-content" },
    ]).content;
    expect(back.slides[0]?.slots).toEqual(slide("a").slots);
  });

  it("merges two text columns into one body", () => {
    const columns = slide("a", {
      layout: "two-content",
      slots: {
        left: { kind: "text", paragraphs: text("Left") },
        right: { kind: "text", paragraphs: text("Right") },
      },
    });
    const { content } = applyDeckOps(deckOf(columns), [
      { op: "setLayout", slideId: "a", layout: "title-content" },
    ]);
    expect(content.slides[0]?.slots).toEqual({
      body: { kind: "text", paragraphs: [...text("Left"), ...text("Right")] },
    });
  });

  it("turns content the new layout cannot hold into free elements at the old position", () => {
    const withOverride = slide("a", {
      slotFrames: { body: { x: 80, y: 280, w: 1120, h: 376 } },
    });
    const { content } = applyDeckOps(
      deckOf(withOverride),
      [{ op: "setLayout", slideId: "a", layout: "blank" }],
      sequentialIds(),
    );
    const result = content.slides[0];
    expect(result?.layout).toBe("blank");
    expect(result?.slots).toEqual({});
    expect(result?.slotFrames).toBeUndefined();
    expect(result?.elements).toEqual([
      {
        id: "new-1",
        kind: "text",
        role: "title",
        frame: { x: 80, y: 48, w: 1120, h: 104 },
        paragraphs: text("Title a"),
      },
      {
        id: "new-2",
        kind: "text",
        role: "body",
        frame: { x: 80, y: 280, w: 1120, h: 376 },
        paragraphs: text("Body a"),
      },
    ]);
  });

  it("keeps a table in the body and frees a text column that cannot merge with it", () => {
    const table = {
      kind: "table" as const,
      table: { header: true, rows: [[{ paragraphs: text("Cell") }]] },
    };
    const columns = slide("a", {
      layout: "two-content",
      slots: { left: table, right: { kind: "text", paragraphs: text("Note") } },
    });
    const { content } = applyDeckOps(
      deckOf(columns),
      [{ op: "setLayout", slideId: "a", layout: "title-content" }],
      sequentialIds(),
    );
    expect(content.slides[0]?.slots).toEqual({ body: table });
    expect(content.slides[0]?.elements).toEqual([
      {
        id: "new-1",
        kind: "text",
        role: "body",
        frame: { x: 672, y: 176, w: 528, h: 480 },
        paragraphs: text("Note"),
      },
    ]);
  });
});

describe("applyDeckOps images", () => {
  const image = {
    hash: "b".repeat(64),
    mimeType: "image/png" as const,
    width: 1600,
    height: 400,
  };
  const other = { ...image, hash: "c".repeat(64), width: 100, height: 100 };

  it("adds an image fitted inside the slide centre with its aspect ratio", () => {
    const { content } = applyDeckOps(
      deckOf(slide("a")),
      [{ op: "addImage", slideId: "a", image, alt: "Banner" }],
      sequentialIds(),
    );
    expect(content.slides[0]?.elements).toEqual([
      {
        id: "new-1",
        kind: "image",
        frame: { x: 160, y: 260, w: 960, h: 240 },
        image,
        alt: "Banner",
      },
    ]);
  });

  it("replaces the picture but keeps the frame, then deletes it", () => {
    const frame = { x: 10, y: 20, w: 300, h: 200 };
    const start = deckOf(
      slide("a", {
        elements: [{ id: "pic", kind: "image", frame, image }],
      }),
    );
    const replaced = applyDeckOps(start, [
      { op: "setImage", slideId: "a", elementId: "pic", image: other },
    ]).content;
    expect(replaced.slides[0]?.elements).toEqual([
      { id: "pic", kind: "image", frame, image: other },
    ]);

    const removed = applyDeckOps(replaced, [
      { op: "deleteElement", slideId: "a", elementId: "pic" },
    ]).content;
    expect(removed.slides[0]?.elements).toEqual([]);
  });

  it("rejects replacing an element that is not an image", () => {
    const start = deckOf(
      slide("a", {
        elements: [
          {
            id: "t",
            kind: "text",
            role: "body",
            frame: { x: 0, y: 0, w: 10, h: 10 },
            paragraphs: text("x"),
          },
        ],
      }),
    );
    expect(() =>
      applyDeckOps(start, [
        { op: "setImage", slideId: "a", elementId: "t", image },
      ]),
    ).toThrow("is not an image");
  });
});

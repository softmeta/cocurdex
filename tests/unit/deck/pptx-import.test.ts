import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyDeckOps } from "@cocurdex/deck/edit";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import { exportDeckToPptx } from "@cocurdex/deck/pptx";
import {
  type PptxImageStore,
  pptxOutline,
  pptxToDeck,
  readPptx,
} from "@cocurdex/deck/pptx-import";
import type { DeckImage, FreeElement, Slide } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  buildPptx,
  group,
  groupXfrm,
  paragraph,
  picture,
  placeholderShape,
  textBox,
  xfrm,
} from "./pptx-ooxml";

const PNG = readFileSync(
  createRequire(import.meta.url).resolve("./fixtures/swatch-3x2.png"),
);
const PNG_IMAGE: DeckImage = {
  hash: "b".repeat(64),
  mimeType: "image/png",
  width: 3,
  height: 2,
};

const MARKDOWN = [
  "# Launch plan",
  "Platform team",
  "---",
  "## Highlights",
  "- **Sync** shipped",
  "  - p95 down",
  "",
  "Notes: Lead with latency.",
  "---",
  "## Numbers",
  "| Metric | Value |",
  "| --- | --- |",
  "| p95 | 120 ms |",
].join("\n");

function counter() {
  let next = 0;
  return () => `id-${++next}`;
}

const storePng: PptxImageStore = async (bytes) =>
  bytes.equals(PNG) ? PNG_IMAGE : null;

function slotText(slide: Slide | undefined, slot: "title" | "body") {
  const content = slide?.slots[slot];
  if (content?.kind !== "text") return null;
  return content.paragraphs.map((p) => p.runs.map((r) => r.text).join(""));
}

function elementsOf(slide: Slide | undefined, kind: FreeElement["kind"]) {
  return (slide?.elements ?? []).filter((element) => element.kind === kind);
}

async function exportedSample() {
  const { content } = compileDeckMarkdown(MARKDOWN);
  const slideId = content.slides[1]?.id ?? "";
  const { content: withImage } = applyDeckOps(content, [
    {
      op: "addImage",
      slideId,
      image: PNG_IMAGE,
      frame: { x: 900, y: 500, w: 300, h: 200 },
      alt: "Swatch",
    },
  ]);
  return exportDeckToPptx(withImage, { title: "Launch plan" }, async () => PNG);
}

describe("pptxToDeck on our own export", () => {
  it("restores layouts, slot text, list levels, and notes", async () => {
    const document = await readPptx(await exportedSample());
    const { content, title } = await pptxToDeck(document, storePng, counter());
    const [cover, highlights, numbers] = content.slides;

    expect(title).toBe("Launch plan");
    expect(content.slides.map((slide) => slide.layout)).toEqual([
      "cover",
      "title-content",
      "title-only",
    ]);
    expect(slotText(cover, "title")).toEqual(["Launch plan"]);
    expect(slotText(highlights, "title")).toEqual(["Highlights"]);
    const body = highlights?.slots.body;
    expect(body?.kind === "text" ? body.paragraphs : []).toMatchObject([
      { list: "bullet", level: 0, runs: [{ text: "Sync", bold: true }, {}] },
      { list: "bullet", level: 1, runs: [{ text: "p95 down" }] },
    ]);
    expect(highlights?.notes).toBe("Lead with latency.");
    expect(elementsOf(numbers, "table")).toHaveLength(1);
  });

  it("brings pictures back as image elements at their frame", async () => {
    const document = await readPptx(await exportedSample());
    const { content, warnings } = await pptxToDeck(
      document,
      storePng,
      counter(),
    );
    const [image] = elementsOf(content.slides[1], "image");

    expect(warnings).toEqual([]);
    expect(image).toMatchObject({
      image: PNG_IMAGE,
      alt: "Swatch",
      frame: { x: 900, y: 500, w: 300, h: 200 },
    });
  });

  it("outlines text and notes as deck Markdown that compiles back", async () => {
    const outline = pptxOutline(await readPptx(await exportedSample()));
    const recompiled = compileDeckMarkdown(outline.markdown);

    expect(outline.slides[1]).toMatchObject({
      index: 1,
      title: "Highlights",
      text: ["- Sync shipped", "  - p95 down", "[Image: Swatch]"],
      notes: "Lead with latency.",
    });
    expect(outline.markdown).toContain("- **Sync** shipped");
    expect(recompiled.content.slides).toHaveLength(3);
    expect(recompiled.content.slides[1]?.notes).toBe("Lead with latency.");
  });
});

const LAYOUT_TITLE = placeholderShape(
  "title",
  null,
  "",
  xfrm(457_200, 274_638, 8_229_600, 1_143_000),
);
const LAYOUT_BODY = placeholderShape(
  "body",
  "1",
  "",
  xfrm(457_200, 1_600_200, 8_229_600, 4_525_963),
);
const MASTER_TITLE = placeholderShape("title", null, "", xfrm(0, 0, 100, 100));

async function standardFixture() {
  return buildPptx({
    size: { cx: 9_144_000, cy: 6_858_000 },
    title: "Quarterly review",
    masterShapes: MASTER_TITLE,
    layoutShapes: LAYOUT_TITLE + LAYOUT_BODY,
    slides: [
      {
        shapes:
          placeholderShape("title", null, paragraph("Agenda")) +
          placeholderShape(
            "obj",
            "1",
            paragraph("Revenue") +
              paragraph("Churn", '<a:pPr lvl="1"/>', '<a:rPr i="1"/>') +
              paragraph("Plain", "<a:pPr><a:buNone/></a:pPr>"),
          ) +
          group(
            groupXfrm(
              [4_572_000, 3_429_000, 914_400, 914_400],
              [0, 0, 1_828_800, 1_828_800],
            ),
            picture("rImg", xfrm(0, 0, 1_828_800, 1_828_800), "Logo") +
              textBox(xfrm(0, 0, 914_400, 457_200), paragraph("Caption")),
          ),
        notes: "Say hello",
        media: [{ id: "rImg", name: "logo.png", bytes: PNG }],
      },
      {
        shapes:
          textBox(xfrm(0, 0, 9_144_000, 914_400), paragraph("Loose box")) +
          '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></p:xfrm><a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame>' +
          picture("rGif", xfrm(0, 0, 10, 10), ""),
        media: [{ id: "rGif", name: "anim.gif", bytes: Buffer.from("GIF89a") }],
      },
    ],
  });
}

describe("pptxToDeck on a hand-built 4:3 presentation", () => {
  it("inherits placeholder frames from the layout and centers 4:3 slides", async () => {
    const { content } = await pptxToDeck(
      await readPptx(await standardFixture()),
      storePng,
      counter(),
    );
    const [agenda] = content.slides;

    expect(content.size).toEqual({ width: 1280, height: 720 });
    expect(agenda?.layout).toBe("title-content");
    expect(agenda?.slotFrames?.title).toEqual({
      x: 208,
      y: 29,
      w: 864,
      h: 120,
    });
    expect(agenda?.slotFrames?.body?.x).toBe(208);
  });

  it("keeps list levels, marks, buNone, notes, and the core title", async () => {
    const result = await pptxToDeck(
      await readPptx(await standardFixture()),
      storePng,
      counter(),
    );
    const body = result.content.slides[0]?.slots.body;

    expect(result.title).toBe("Quarterly review");
    expect(body?.kind === "text" ? body.paragraphs : []).toEqual([
      { list: "bullet", level: 0, runs: [{ text: "Revenue" }] },
      { list: "bullet", level: 1, runs: [{ text: "Churn", italic: true }] },
      { runs: [{ text: "Plain" }] },
    ]);
    expect(result.content.slides[0]?.notes).toBe("Say hello");
  });

  it("applies group transforms to pictures and text inside a group", async () => {
    const { content } = await pptxToDeck(
      await readPptx(await standardFixture()),
      storePng,
      counter(),
    );
    const [image] = elementsOf(content.slides[0], "image");
    const [caption] = elementsOf(content.slides[0], "text");

    expect(image).toMatchObject({
      alt: "Logo",
      frame: { x: 640, y: 360, w: 96, h: 96 },
    });
    expect(caption?.frame).toEqual({ x: 640, y: 360, w: 48, h: 24 });
  });

  it("imports untitled slides as blank and warns about what it skips", async () => {
    const { content, warnings } = await pptxToDeck(
      await readPptx(await standardFixture()),
      storePng,
      counter(),
    );
    const loose = content.slides[1];

    expect(loose?.layout).toBe("blank");
    expect(elementsOf(loose, "text")).toHaveLength(1);
    expect(warnings.map((warning) => warning.slideIndex)).toEqual([1, 1]);
    expect(warnings.map((warning) => warning.message).join("\n")).toMatch(
      /anim\.gif[\s\S]*Skipped 1 charts/,
    );
  });

  it("rejects files that are not presentations", async () => {
    await expect(readPptx(Buffer.from("not a zip"))).rejects.toThrow();
  });
});

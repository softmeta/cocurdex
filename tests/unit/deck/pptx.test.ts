import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyDeckOps } from "@cocurdex/deck/edit";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import { exportDeckToPptx } from "@cocurdex/deck/pptx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const MARKDOWN = [
  "# Launch plan",
  "Platform team",
  "---",
  "## Highlights",
  "- Sync shipped",
  "  - p95 down",
  "",
  "Notes: Lead with latency.",
  "---",
  "## Numbers",
  "| Metric | Value |",
  "| --- | --- |",
  "| p95 | 120 ms |",
  "---",
  "# Thanks",
].join("\n");

const PNG = readFileSync(
  createRequire(import.meta.url).resolve("./fixtures/swatch-3x2.png"),
);
const PNG_HASH = "a".repeat(64);

async function noImages(hash: string): Promise<Buffer> {
  throw new Error(`Unexpected image ${hash}`);
}

async function exportSample() {
  const { content } = compileDeckMarkdown(MARKDOWN);
  return JSZip.loadAsync(
    await exportDeckToPptx(content, { title: "Launch plan" }, noImages),
  );
}

async function text(zip: JSZip, name: string) {
  const file = zip.file(name);
  if (!file) throw new Error(`Missing ${name}`);
  return file.async("string");
}

describe("exportDeckToPptx", () => {
  it("writes one slide per deck slide in a widescreen presentation", async () => {
    const zip = await exportSample();
    const slides = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
    const presentation = await text(zip, "ppt/presentation.xml");

    expect(slides).toHaveLength(4);
    expect(presentation).toContain('cx="12192000" cy="6858000"');
  });

  it("fills layout placeholders so text stays editable in PowerPoint", async () => {
    const zip = await exportSample();
    const highlights = await text(zip, "ppt/slides/slide2.xml");

    expect(highlights).toMatch(/<p:ph[^>]*type="title"/);
    expect(highlights).toContain("Highlights");
    expect(highlights).toContain("Sync shipped");
    expect(highlights).toMatch(/lvl="1"/);
  });

  it("exports tables as native tables and speaker notes as notes", async () => {
    const zip = await exportSample();
    const numbers = await text(zip, "ppt/slides/slide3.xml");
    const notes = await Promise.all(
      zip
        .file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)
        .map((file) => file.async("string")),
    );

    expect(numbers).toContain("<a:tbl>");
    expect(numbers).toContain("120 ms");
    expect(notes.some((xml) => xml.includes("Lead with latency."))).toBe(true);
  });

  it("embeds slide images as pictures at their fitted frame", async () => {
    const { content: base } = compileDeckMarkdown("## Chart");
    const slideId = base.slides[0]?.id ?? "";
    const { content } = applyDeckOps(base, [
      {
        op: "addImage",
        slideId,
        image: {
          hash: PNG_HASH,
          mimeType: "image/png",
          width: 3,
          height: 2,
        },
        alt: "Swatch",
      },
    ]);
    const zip = await JSZip.loadAsync(
      await exportDeckToPptx(content, { title: "Chart" }, async (hash) => {
        if (hash !== PNG_HASH) throw new Error(hash);
        return PNG;
      }),
    );
    const xml = await text(zip, "ppt/slides/slide1.xml");
    const media = zip.file(/^ppt\/media\/.+\.png$/);

    expect(xml).toContain("<p:pic>");
    expect(xml).toContain('descr="Swatch"');
    expect(media).toHaveLength(1);
    expect(await media[0]?.async("nodebuffer")).toEqual(PNG);
  });

  it("carries theme backgrounds, decorations, fonts, and page numbers into layouts", async () => {
    const { content } = compileDeckMarkdown(MARKDOWN);
    const exportTheme = async (theme: "nebula" | "editorial") =>
      JSZip.loadAsync(
        await exportDeckToPptx({ ...content, theme }, { title: "T" }, noImages),
      );
    const nebula = await exportTheme("nebula");
    const editorial = await exportTheme("editorial");
    const layoutXml = async (zip: JSZip) =>
      Promise.all(
        zip
          .file(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)
          .map((file) => file.async("string")),
      );
    const nebulaLayouts = (await layoutXml(nebula)).join("\n");
    const editorialLayouts = (await layoutXml(editorial)).join("\n");

    expect(nebulaLayouts).toMatch(/<p:bg>[\s\S]*?<a:blip /);
    expect(nebula.file(/^ppt\/media\/.+\.png$/).length).toBeGreaterThan(0);
    expect(nebulaLayouts).toContain('type="sldNum"');
    expect(editorialLayouts).toContain('typeface="Georgia"');
  });

  it("keeps rotated, dashed, rounded, and patterned decorations editable as shapes", async () => {
    const { content } = compileDeckMarkdown(
      [
        "# Review",
        "---",
        "# Part one",
        "Intro",
        "---",
        "## Plan",
        "- Step",
      ].join("\n"),
    );
    const exportTheme = async (theme: "blueprint" | "playful") =>
      JSZip.loadAsync(
        await exportDeckToPptx({ ...content, theme }, { title: "T" }, noImages),
      );
    const layouts = async (zip: JSZip) =>
      (
        await Promise.all(
          zip
            .file(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)
            .map((file) => file.async("string")),
        )
      ).join("\n");
    const blueprint = await exportTheme("blueprint");
    const playful = await exportTheme("playful");
    const blueprintLayouts = await layouts(blueprint);
    const playfulLayouts = await layouts(playful);

    expect(blueprintLayouts).toMatch(/rot="2700000"/);
    expect(blueprintLayouts).toContain('<a:prstDash val="dash"/>');
    expect(blueprintLayouts).toMatch(/<p:pic>[\s\S]*?<a:blip /);
    expect(playfulLayouts).toContain('prst="roundRect"');
    const sectionSlide = await text(blueprint, "ppt/slides/slide2.xml");
    expect(sectionSlide).toContain("<a:t>01</a:t>");
  });
});

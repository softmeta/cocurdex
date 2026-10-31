import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { systemPdfFonts } from "@cocurdex/daemon/internal/decks/deck-service";
import { applyDeckOps } from "@cocurdex/deck/edit";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import { exportDeckToPdf } from "@cocurdex/deck/pdf";
import { DECK_THEME_IDS } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const MARKDOWN = `# Checkout review

Acme Shop · 结账评审

---

## Discount codes

- Fixed amount codes are **live**
- 百分比折扣码 *in review*
  - \`SPRING10\` takes 10% off

---

## Rollout

| Code | Status |
| --- | --- |
| SPRING10 | Live |
`;

function pageBoxes(pdf: Buffer): string[] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[([^\]]+)\]/g)].map(
    (match) => (match[1] ?? "").trim(),
  );
}

describe("deck PDF export", () => {
  it("finds a usable system font on this host", () => {
    expect(systemPdfFonts()).not.toBeNull();
  });

  it("renders one 16:9 page per slide", async () => {
    const fonts = systemPdfFonts();
    if (!fonts) throw new Error("No system font");
    const { content } = compileDeckMarkdown(MARKDOWN);
    const pdf = await exportDeckToPdf(
      content,
      { title: "Checkout review" },
      fonts,
      async (hash) => {
        throw new Error(`Unexpected image ${hash}`);
      },
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pageBoxes(pdf)).toEqual(Array(3).fill("0 0 960 540"));
  });

  it.each(DECK_THEME_IDS)("renders the %s theme", async (theme) => {
    const fonts = systemPdfFonts();
    if (!fonts) throw new Error("No system font");
    const { content } = compileDeckMarkdown(MARKDOWN);
    const pdf = await exportDeckToPdf(
      { ...content, theme },
      { title: "Checkout review" },
      fonts,
      async (hash) => {
        throw new Error(`Unexpected image ${hash}`);
      },
    );
    expect(pageBoxes(pdf)).toHaveLength(3);
  });

  it("embeds slide images", async () => {
    const fonts = systemPdfFonts();
    if (!fonts) throw new Error("No system font");
    const png = readFileSync(
      createRequire(import.meta.url).resolve("./fixtures/swatch-3x2.png"),
    );
    const { content: base } = compileDeckMarkdown("## Chart");
    const hash = "f".repeat(64);
    const { content } = applyDeckOps(base, [
      {
        op: "addImage",
        slideId: base.slides[0]?.id ?? "",
        image: { hash, mimeType: "image/png", width: 3, height: 2 },
      },
    ]);
    const pdf = await exportDeckToPdf(
      content,
      { title: "Chart" },
      fonts,
      async () => png,
    );
    expect(pdf.toString("latin1")).toMatch(/\/Subtype \/Image/);
  });
});

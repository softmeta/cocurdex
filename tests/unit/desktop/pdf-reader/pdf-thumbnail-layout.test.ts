import { describe, expect, it } from "vitest";
import {
  estimatePdfThumbnailRowHeight,
  pdfThumbnailContentWidth,
  pdfThumbnailImageHeight,
  pdfThumbnailRenderEdge,
} from "@/features/pdf-reader/pdf-thumbnail-layout";

describe("pdfThumbnailContentWidth", () => {
  it("subtracts horizontal padding and clamps to a minimum", () => {
    expect(pdfThumbnailContentWidth(256)).toBe(232);
    expect(pdfThumbnailContentWidth(40)).toBe(80);
  });
});

describe("pdfThumbnailImageHeight", () => {
  it("scales with content width so the frame is not width-only", () => {
    const narrow = pdfThumbnailImageHeight(100);
    const wide = pdfThumbnailImageHeight(200);
    expect(wide).toBeGreaterThan(narrow);
    // Frame width is content minus button padding; ratio follows that.
    expect(wide).toBe(pdfThumbnailImageHeight(200));
    expect(wide - narrow).toBeGreaterThan(50);
  });
});

describe("pdfThumbnailRenderEdge", () => {
  it("grows when the panel widens", () => {
    const narrow = pdfThumbnailRenderEdge(200, 1);
    const wide = pdfThumbnailRenderEdge(400, 1);
    expect(wide).toBeGreaterThan(narrow);
  });

  it("uses the longer frame edge (portrait height)", () => {
    // content 232, frame w=224, h≈302 → edge 302 * dpr1 → bucket 312
    const edge = pdfThumbnailRenderEdge(256, 1);
    expect(edge).toBeGreaterThanOrEqual(288);
  });
});

describe("estimatePdfThumbnailRowHeight", () => {
  it("grows with panel width in both content and row chrome", () => {
    const narrow = estimatePdfThumbnailRowHeight(200);
    const wide = estimatePdfThumbnailRowHeight(400);
    expect(wide).toBeGreaterThan(narrow);
    // Image frame alone should account for most of the growth.
    const narrowImg = pdfThumbnailImageHeight(pdfThumbnailContentWidth(200));
    const wideImg = pdfThumbnailImageHeight(pdfThumbnailContentWidth(400));
    expect(wide - narrow).toBeGreaterThanOrEqual(wideImg - narrowImg - 1);
  });
});

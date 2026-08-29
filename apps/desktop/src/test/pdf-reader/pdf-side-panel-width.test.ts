import { describe, expect, it } from "vitest";
import {
  clampPdfSidePanelWidth,
  normalizePdfSidePanelWidth,
  PDF_SIDE_PANEL_DEFAULT_WIDTH,
  PDF_SIDE_PANEL_MAX_WIDTH,
  PDF_SIDE_PANEL_MIN_WIDTH,
} from "@/features/pdf-reader/pdf-side-panel-width";

describe("clampPdfSidePanelWidth", () => {
  it("clamps to min and max", () => {
    expect(clampPdfSidePanelWidth(PDF_SIDE_PANEL_MIN_WIDTH - 40)).toBe(
      PDF_SIDE_PANEL_MIN_WIDTH,
    );
    expect(clampPdfSidePanelWidth(PDF_SIDE_PANEL_MAX_WIDTH + 40)).toBe(
      PDF_SIDE_PANEL_MAX_WIDTH,
    );
    expect(clampPdfSidePanelWidth(300)).toBe(300);
  });

  it("falls back for non-finite values", () => {
    expect(clampPdfSidePanelWidth(Number.NaN)).toBe(
      PDF_SIDE_PANEL_DEFAULT_WIDTH,
    );
    expect(clampPdfSidePanelWidth(Number.POSITIVE_INFINITY)).toBe(
      PDF_SIDE_PANEL_DEFAULT_WIDTH,
    );
  });
});

describe("normalizePdfSidePanelWidth", () => {
  it("accepts numbers and rejects other types", () => {
    expect(normalizePdfSidePanelWidth(220)).toBe(220);
    expect(normalizePdfSidePanelWidth("220")).toBe(
      PDF_SIDE_PANEL_DEFAULT_WIDTH,
    );
    expect(normalizePdfSidePanelWidth(null)).toBe(PDF_SIDE_PANEL_DEFAULT_WIDTH);
  });
});

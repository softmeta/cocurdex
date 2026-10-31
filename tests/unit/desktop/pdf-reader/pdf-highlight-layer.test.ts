import { describe, expect, it } from "vitest";
import type { PdfHighlight } from "@/features/pdf-reader/pdf-annotations";
import {
  PDF_HIGHLIGHT_LAYER_CLASS,
  PDF_HIGHLIGHT_RECT_CLASS,
  paintPdfHighlights,
} from "@/features/pdf-reader/pdf-highlight-layer";

function makePage(pageNumber: number): HTMLElement {
  const page = document.createElement("div");
  page.className = "page";
  page.dataset.pageNumber = String(pageNumber);
  const canvas = document.createElement("div");
  canvas.className = "canvasWrapper";
  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  page.append(canvas, textLayer);
  return page;
}

const highlightOnPage2: PdfHighlight = {
  id: "h1",
  pageNumber: 2,
  color: "yellow",
  selectedText: "hello",
  quads: [{ x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.3 }],
  createdAt: 1,
};

describe("paintPdfHighlights", () => {
  it("paints rects on the matching page under the text layer", () => {
    const root = document.createElement("div");
    root.className = "pdfViewer";
    const page1 = makePage(1);
    const page2 = makePage(2);
    root.append(page1, page2);
    document.body.appendChild(root);

    paintPdfHighlights(root, [highlightOnPage2]);

    expect(page1.querySelector(`.${PDF_HIGHLIGHT_LAYER_CLASS}`)).toBeNull();
    const layer = page2.querySelector(`.${PDF_HIGHLIGHT_LAYER_CLASS}`);
    expect(layer).not.toBeNull();
    // Layer is appended after the text layer so DOM hit-testing can sample it.
    expect(
      page2.lastElementChild?.classList.contains(PDF_HIGHLIGHT_LAYER_CLASS),
    ).toBe(true);
    const rect = layer?.querySelector(
      `.${PDF_HIGHLIGHT_RECT_CLASS}`,
    ) as HTMLElement;
    expect(rect.style.left).toBe("10%");
    expect(rect.style.top).toBe("20%");
    expect(rect.style.width).toBe("40%");
    expect(rect.style.height).toBe("10%");
    expect(rect.dataset.highlightId).toBe("h1");

    root.remove();
  });

  it("clears previous layers when highlights change", () => {
    const root = document.createElement("div");
    root.className = "pdfViewer";
    const page2 = makePage(2);
    root.appendChild(page2);
    document.body.appendChild(root);

    paintPdfHighlights(root, [highlightOnPage2]);
    expect(page2.querySelectorAll(`.${PDF_HIGHLIGHT_RECT_CLASS}`)).toHaveLength(
      1,
    );

    paintPdfHighlights(root, []);
    expect(page2.querySelector(`.${PDF_HIGHLIGHT_LAYER_CLASS}`)).toBeNull();

    root.remove();
  });
});

import type { PdfHighlight, PdfHighlightColor } from "./pdf-annotations";

export const PDF_HIGHLIGHT_LAYER_CLASS = "pdf-highlight-layer";
export const PDF_HIGHLIGHT_RECT_CLASS = "pdf-highlight-rect";

// Shared fill colors for page overlays and the selection toolbar swatches.
export const PDF_HIGHLIGHT_COLOR_CSS: Record<PdfHighlightColor, string> = {
  yellow: "rgba(250, 204, 21, 0.45)",
  green: "rgba(74, 222, 128, 0.45)",
  blue: "rgba(96, 165, 250, 0.45)",
  pink: "rgba(244, 114, 182, 0.45)",
};

// Solid swatch chips (toolbar / marks list) — slightly more opaque for contrast.
export const PDF_HIGHLIGHT_SWATCH_CSS: Record<PdfHighlightColor, string> = {
  yellow: "rgb(250, 204, 21)",
  green: "rgb(74, 222, 128)",
  blue: "rgb(96, 165, 250)",
  pink: "rgb(244, 114, 182)",
};

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clearHighlightLayers(root: ParentNode): void {
  const existing = root.querySelectorAll(`.${PDF_HIGHLIGHT_LAYER_CLASS}`);
  for (const node of existing) {
    node.remove();
  }
}

function paintPageHighlights(
  pageElement: HTMLElement,
  highlights: PdfHighlight[],
): void {
  for (const node of pageElement.querySelectorAll(
    `.${PDF_HIGHLIGHT_LAYER_CLASS}`,
  )) {
    node.remove();
  }

  if (highlights.length === 0) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = PDF_HIGHLIGHT_LAYER_CLASS;
  layer.setAttribute("aria-hidden", "true");

  for (const highlight of highlights) {
    for (const quad of highlight.quads) {
      const rect = document.createElement("div");
      rect.className = PDF_HIGHLIGHT_RECT_CLASS;
      rect.dataset.highlightId = highlight.id;
      // Round to avoid float noise in inline styles (e.g. 9.999…%).
      rect.style.left = `${roundPercent(quad.x1 * 100)}%`;
      rect.style.top = `${roundPercent(quad.y1 * 100)}%`;
      rect.style.width = `${roundPercent((quad.x2 - quad.x1) * 100)}%`;
      rect.style.height = `${roundPercent((quad.y2 - quad.y1) * 100)}%`;
      rect.style.backgroundColor = PDF_HIGHLIGHT_COLOR_CSS[highlight.color];
      layer.appendChild(rect);
    }
  }

  // Paint above the text layer so DOM hit-testing (temporary pointer-events)
  // samples the visible highlight. Default CSS keeps pointer-events: none so
  // left-drag text selection is unaffected.
  pageElement.appendChild(layer);
}

// Paint (or clear) highlight overlays inside a pdf.js viewer root. Safe to call
// after every `pagerendered` and whenever the highlight list changes — pages
// that are not in the DOM yet are simply skipped until they render.
export function paintPdfHighlights(
  viewerRoot: HTMLElement | null | undefined,
  highlights: readonly PdfHighlight[],
): void {
  if (!viewerRoot) {
    return;
  }

  const byPage = new Map<number, PdfHighlight[]>();
  for (const highlight of highlights) {
    const list = byPage.get(highlight.pageNumber) ?? [];
    list.push(highlight);
    byPage.set(highlight.pageNumber, list);
  }

  const pages = viewerRoot.querySelectorAll<HTMLElement>(
    ".page[data-page-number]",
  );
  if (pages.length === 0) {
    // Viewer not laid out yet; nothing to paint.
    return;
  }

  // Clear layers on pages that no longer have highlights, then paint the rest.
  clearHighlightLayers(viewerRoot);
  for (const page of pages) {
    const pageNumber = Number.parseInt(page.dataset.pageNumber ?? "", 10);
    if (!Number.isInteger(pageNumber)) {
      continue;
    }
    paintPageHighlights(page, byPage.get(pageNumber) ?? []);
  }
}

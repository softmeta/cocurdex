import type { PDFDocumentProxy } from "pdfjs-dist";

// Longest edge of a thumbnail canvas in CSS pixels. Small enough for a dense
// rail, large enough to read page shape at a glance.
export const PDF_THUMBNAIL_MAX_EDGE = 140;

// Render a single page to a JPEG data URL for the thumbnails rail. Kept inside
// the pdf.js isolation boundary so the rest of the reader never imports pdfjs.
export async function renderPdfPageThumbnail(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxEdgePx: number = PDF_THUMBNAIL_MAX_EDGE,
): Promise<string | null> {
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > pdf.numPages ||
    maxEdgePx < 1
  ) {
    return null;
  }

  const page = await pdf.getPage(pageNumber);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const longest = Math.max(baseViewport.width, baseViewport.height);
    if (longest <= 0) {
      return null;
    }
    const scale = maxEdgePx / longest;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const task = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      intent: "display",
    });
    await task.promise;
    // JPEG keeps localStorage-free memory lower than PNG for photo-heavy pages.
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    page.cleanup();
  }
}

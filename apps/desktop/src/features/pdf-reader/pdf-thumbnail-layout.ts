// Horizontal padding on each thumbnail row (`px-3` both sides).
export const PDF_THUMBNAIL_INLINE_PADDING = 24;
// Inner button padding (`p-1` both sides) subtracted from the image frame.
export const PDF_THUMBNAIL_BUTTON_PADDING = 8;
// Bucket render size so drag-resizing does not re-rasterize every pixel.
export const PDF_THUMBNAIL_EDGE_BUCKET = 24;
// Portrait page height / width used for the image frame and row layout.
// Real pages keep aspect via object-contain inside this box.
const PORTRAIT_ASPECT = 1.35;
// Label + vertical gaps under the thumb button.
const ROW_CHROME = 40;

export function pdfThumbnailContentWidth(panelWidth: number): number {
  if (!Number.isFinite(panelWidth)) {
    return 80;
  }
  return Math.max(80, Math.round(panelWidth) - PDF_THUMBNAIL_INLINE_PADDING);
}

// Image frame height grows with content width so widening the rail scales the
// thumbnail in both axes (not only horizontally).
export function pdfThumbnailImageHeight(contentWidth: number): number {
  const frameWidth = Math.max(40, contentWidth - PDF_THUMBNAIL_BUTTON_PADDING);
  return Math.round(frameWidth * PORTRAIT_ASPECT);
}

// CSS/device-pixel edge used when rasterizing a page. Larger side panels request
// sharper thumbnails; values snap to EDGE_BUCKET to reuse cache entries while
// dragging the rail. Uses the longer image-frame edge so portrait pages stay sharp.
export function pdfThumbnailRenderEdge(
  panelWidth: number,
  devicePixelRatio = 1,
): number {
  const content = pdfThumbnailContentWidth(panelWidth);
  const frameWidth = Math.max(40, content - PDF_THUMBNAIL_BUTTON_PADDING);
  const frameHeight = pdfThumbnailImageHeight(content);
  const cssEdge = Math.max(frameWidth, frameHeight);
  const dpr = Number.isFinite(devicePixelRatio)
    ? Math.min(Math.max(devicePixelRatio, 1), 2)
    : 1;
  const raw = Math.round(cssEdge * dpr);
  const bucketed =
    Math.round(raw / PDF_THUMBNAIL_EDGE_BUCKET) * PDF_THUMBNAIL_EDGE_BUCKET;
  return Math.max(PDF_THUMBNAIL_EDGE_BUCKET, bucketed);
}

export function estimatePdfThumbnailRowHeight(panelWidth: number): number {
  const content = pdfThumbnailContentWidth(panelWidth);
  return Math.round(
    pdfThumbnailImageHeight(content) +
      PDF_THUMBNAIL_BUTTON_PADDING +
      ROW_CHROME,
  );
}

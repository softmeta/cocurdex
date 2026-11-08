export const PDF_THUMBNAIL_INLINE_PADDING = 24;
export const PDF_THUMBNAIL_BUTTON_PADDING = 8;
export const PDF_THUMBNAIL_EDGE_BUCKET = 24;
const PORTRAIT_ASPECT = 1.35;
const ROW_CHROME = 40;

export function pdfThumbnailContentWidth(panelWidth: number): number {
  if (!Number.isFinite(panelWidth)) {
    return 80;
  }
  return Math.max(80, Math.round(panelWidth) - PDF_THUMBNAIL_INLINE_PADDING);
}

export function pdfThumbnailImageHeight(contentWidth: number): number {
  const frameWidth = Math.max(40, contentWidth - PDF_THUMBNAIL_BUTTON_PADDING);
  return Math.round(frameWidth * PORTRAIT_ASPECT);
}

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

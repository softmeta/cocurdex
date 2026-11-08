export const PDF_SIDE_PANEL_DEFAULT_WIDTH = 256;
export const PDF_SIDE_PANEL_MIN_WIDTH = 180;
export const PDF_SIDE_PANEL_MAX_WIDTH = 480;

export function clampPdfSidePanelWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return PDF_SIDE_PANEL_DEFAULT_WIDTH;
  }
  return Math.min(
    PDF_SIDE_PANEL_MAX_WIDTH,
    Math.max(PDF_SIDE_PANEL_MIN_WIDTH, Math.round(width)),
  );
}

export function normalizePdfSidePanelWidth(value: unknown): number {
  if (typeof value !== "number") {
    return PDF_SIDE_PANEL_DEFAULT_WIDTH;
  }
  return clampPdfSidePanelWidth(value);
}

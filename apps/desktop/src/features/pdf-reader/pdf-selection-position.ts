// Viewport-aware placement for the fixed PDF selection toolbar.
// Prefer bottom-start under the selection; flip above and shift horizontally
// when the bubble would overflow the window edge.

export const PDF_SELECTION_BUBBLE_GAP = 8;
export const PDF_SELECTION_BUBBLE_PADDING = 8;

export interface PdfSelectionAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export function placeFixedBubble(
  anchor: PdfSelectionAnchorRect,
  bubble: Size,
  viewport: Size,
  options?: {
    gap?: number;
    padding?: number;
  },
): { left: number; top: number } {
  const gap = options?.gap ?? PDF_SELECTION_BUBBLE_GAP;
  const padding = options?.padding ?? PDF_SELECTION_BUBBLE_PADDING;

  let top = anchor.top + anchor.height + gap;
  const fitsBelow = top + bubble.height <= viewport.height - padding;
  if (!fitsBelow) {
    const above = anchor.top - gap - bubble.height;
    top =
      above >= padding
        ? above
        : Math.max(padding, viewport.height - bubble.height - padding);
  }

  const maxLeft = Math.max(padding, viewport.width - bubble.width - padding);
  const left = Math.min(maxLeft, Math.max(padding, anchor.left));

  return { left, top };
}

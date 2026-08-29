import { type ReactNode, useCallback } from "react";
import {
  type PdfSelectionAnchorRect,
  placeFixedBubble,
} from "./pdf-selection-position";

interface PdfSelectionAnchorProps {
  anchor: PdfSelectionAnchorRect;
  children: ReactNode;
}

// Measures the bubble after mount and clamps it inside the viewport so edge
// selections do not clip the toolbar (right edge swatches, bottom overflow).
export function PdfSelectionAnchor({
  anchor,
  children,
}: PdfSelectionAnchorProps) {
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return;
      }
      const { width, height } = node.getBoundingClientRect();
      const next = placeFixedBubble(
        anchor,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      node.style.left = `${next.left}px`;
      node.style.top = `${next.top}px`;
    },
    [anchor],
  );

  // Initial coords are a best-effort below-start; the callback ref corrects
  // before paint when width/height are known.
  const initial = placeFixedBubble(
    anchor,
    { width: 0, height: 0 },
    {
      width: typeof window === "undefined" ? 0 : window.innerWidth,
      height: typeof window === "undefined" ? 0 : window.innerHeight,
    },
  );

  return (
    <div
      ref={attach}
      className="fixed z-50"
      style={{ left: initial.left, top: initial.top }}
    >
      {children}
    </div>
  );
}

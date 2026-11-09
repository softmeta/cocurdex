import { type ReactNode, useCallback } from "react";
import {
  type PdfSelectionAnchorRect,
  placeFixedBubble,
} from "./pdf-selection-position";

interface PdfSelectionAnchorProps {
  anchor: PdfSelectionAnchorRect;
  children: ReactNode;
}

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

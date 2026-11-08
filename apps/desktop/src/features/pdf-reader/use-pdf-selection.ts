import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfHighlight, PdfQuad } from "./pdf-annotations";
import {
  extractSelectionGeometry,
  findHighlightAtClientPoint,
} from "./pdf-selection-geometry";

const MIN_SELECTION_ACTIONABLE_CHARS = 2;
const CONTEXT_MENU_DISMISS_GRACE_MS = 400;

export interface PdfTextSelectionState {
  kind: "text";
  selectedText: string;
  anchor: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  pageNumber: number | null;
  quads: PdfQuad[] | null;
}

export interface PdfHighlightSelectionState {
  kind: "highlight";
  highlightId: string;
  anchor: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type PdfSelectionState =
  | PdfTextSelectionState
  | PdfHighlightSelectionState;

function isSelectionActionable(text: string): boolean {
  return [...text.replace(/\s+/g, "")].length >= MIN_SELECTION_ACTIONABLE_CHARS;
}

function isWithinContainer(
  container: HTMLElement,
  selection: Selection,
): boolean {
  const { anchorNode, focusNode } = selection;
  return (
    anchorNode !== null &&
    focusNode !== null &&
    container.contains(anchorNode) &&
    container.contains(focusNode)
  );
}

function isOnSelectionToolbar(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-pdf-selection-toolbar]") != null
  );
}

export function usePdfSelection(highlights: readonly PdfHighlight[]) {
  const [selection, setSelection] = useState<PdfSelectionState | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  const suppressDismissUntilRef = useRef(0);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const containerRef = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  useEffect(() => {
    if (!container) {
      return;
    }

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      if (isOnSelectionToolbar(event.target)) {
        return;
      }

      const domSelection = window.getSelection();
      if (
        domSelection &&
        !domSelection.isCollapsed &&
        domSelection.rangeCount > 0 &&
        isWithinContainer(container, domSelection)
      ) {
        const text = domSelection.toString();
        if (text.trim().length > 0 && isSelectionActionable(text)) {
          const range = domSelection.getRangeAt(0);
          const geometry = extractSelectionGeometry(range);
          const rect = range.getBoundingClientRect();
          setSelection({
            kind: "text",
            selectedText: text,
            anchor: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
            pageNumber: geometry?.pageNumber ?? null,
            quads: geometry?.quads ?? null,
          });
          return;
        }
      }

      if (performance.now() < suppressDismissUntilRef.current) {
        return;
      }

      setSelection(null);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isOnSelectionToolbar(event.target)) {
        return;
      }
      if (!container.contains(event.target as Node)) {
        const topEl = document.elementFromPoint(event.clientX, event.clientY);
        if (!topEl || !container.contains(topEl)) {
          return;
        }
      }

      const hit = findHighlightAtClientPoint(
        highlightsRef.current,
        event.clientX,
        event.clientY,
        event.target,
        container,
      );
      if (!hit) {
        setSelection(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressDismissUntilRef.current =
        performance.now() + CONTEXT_MENU_DISMISS_GRACE_MS;
      setSelection({
        kind: "highlight",
        highlightId: hit.id,
        anchor: {
          left: event.clientX,
          top: event.clientY,
          width: 0,
          height: 0,
        },
      });
    };

    const handleScroll = () => setSelection(null);

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("contextmenu", handleContextMenu, true);
    container.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      container.removeEventListener("scroll", handleScroll, true);
    };
  }, [container]);

  return { selection, clearSelection, containerRef };
}

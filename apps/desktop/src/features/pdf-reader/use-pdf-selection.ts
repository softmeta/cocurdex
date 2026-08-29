import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfHighlight, PdfQuad } from "./pdf-annotations";
import {
  extractSelectionGeometry,
  findHighlightAtClientPoint,
} from "./pdf-selection-geometry";

// Mirror the Monaco editor's threshold so a stray click-drag of one glyph does
// not pop the bubble. Counts non-whitespace characters in the selection.
const MIN_SELECTION_ACTIONABLE_CHARS = 2;
// After opening a highlight context menu, browsers often deliver a trailing
// mouseup (esp. Firefox order, or macOS Control-click). Ignore dismiss for a
// short window so the menu is not wiped immediately.
const CONTEXT_MENU_DISMISS_GRACE_MS = 400;

export interface PdfTextSelectionState {
  kind: "text";
  selectedText: string;
  // Selection bounds in viewport coords. The fixed bubble is placed from this
  // rect (flip/shift near window edges) — no scroll math against the page
  // container is needed.
  anchor: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  // Present when the selection lies on a single pdf.js page; used for
  // highlights. Cross-page selections still allow "Add to Chat" without geometry.
  pageNumber: number | null;
  quads: PdfQuad[] | null;
}

// Opened via context menu on an existing mark — not left-click, so reading /
// text selection stay undisturbed.
export interface PdfHighlightSelectionState {
  kind: "highlight";
  highlightId: string;
  // Zero-size anchor at the pointer so placement still clamps to the viewport.
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

// Bridges native DOM text selection and right-click highlight actions over
// pdf.js's text layer to a floating toolbar anchor.
export function usePdfSelection(highlights: readonly PdfHighlight[]) {
  const [selection, setSelection] = useState<PdfSelectionState | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // Latest list for the document listener; avoids re-binding on every paint.
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  // Timestamp until which left-button mouseup must not dismiss a just-opened
  // highlight menu (see CONTEXT_MENU_DISMISS_GRACE_MS).
  const suppressDismissUntilRef = useRef(0);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  // Callback ref — triggers a state update when the DOM node mounts/unmounts,
  // which in turn re-runs the listener effect below.
  const containerRef = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  useEffect(() => {
    if (!container) {
      return;
    }

    // Primary-button release only: text-selection bubble, or dismiss. Highlight
    // menus open exclusively via contextmenu.
    const handleMouseUp = (event: MouseEvent) => {
      // button 0 = primary (left). Right/middle releases must not dismiss a
      // menu that was just opened by contextmenu.
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

    // Right-click / Control-click on a stored mark: suppress the OS menu and
    // show delete. Capture phase so nothing under the viewer steals it first.
    const handleContextMenu = (event: MouseEvent) => {
      if (isOnSelectionToolbar(event.target)) {
        return;
      }
      if (!container.contains(event.target as Node)) {
        // Also accept when the event target is outside but the point is inside
        // (some pdf.js layers re-target oddly); still require the point in view.
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
        // Right-click on unmarked content: drop our menu; allow OS menu.
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

    // A scroll invalidates the captured viewport anchor; drop the bubble rather
    // than leave it floating over unrelated content.
    const handleScroll = () => setSelection(null);

    // Listen on the document, not the container: a drag that starts over the
    // text layer can be released outside it (or a click elsewhere should
    // dismiss the bubble), and those mouseups never reach the container.
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

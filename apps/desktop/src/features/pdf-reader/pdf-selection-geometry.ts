import type { PdfHighlight, PdfQuad } from "./pdf-annotations";

// Geometry extracted from a DOM text selection over a pdf.js text layer.
export interface PdfSelectionGeometry {
  pageNumber: number;
  quads: PdfQuad[];
}

// pdf.js page roots carry `data-page-number` (1-based) and the `page` class.
export function findPdfPageElement(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement) {
      if (
        current.classList.contains("page") &&
        current.dataset.pageNumber != null
      ) {
        return current;
      }
    }
    current = current.parentNode;
  }
  return null;
}

export function parsePdfPageNumber(pageElement: HTMLElement): number | null {
  const raw = pageElement.dataset.pageNumber;
  if (raw == null) {
    return null;
  }
  const pageNumber = Number.parseInt(raw, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return null;
  }
  return pageNumber;
}

// Convert a client-space rect into page-normalized coordinates (0–1).
export function clientRectToPageQuad(
  rect: DOMRectReadOnly,
  pageRect: DOMRectReadOnly,
): PdfQuad | null {
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return null;
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x1 = (rect.left - pageRect.left) / pageRect.width;
  const y1 = (rect.top - pageRect.top) / pageRect.height;
  const x2 = (rect.right - pageRect.left) / pageRect.width;
  const y2 = (rect.bottom - pageRect.top) / pageRect.height;

  // Drop rects that fall completely outside the page box (e.g. inter-page
  // selection artefacts). Allow slight overflow and clamp at paint time via
  // normalize; here we only require a positive area after intersection.
  const clampedX1 = Math.max(0, Math.min(1, x1));
  const clampedY1 = Math.max(0, Math.min(1, y1));
  const clampedX2 = Math.max(0, Math.min(1, x2));
  const clampedY2 = Math.max(0, Math.min(1, y2));
  if (clampedX2 <= clampedX1 || clampedY2 <= clampedY1) {
    return null;
  }
  return {
    x1: clampedX1,
    y1: clampedY1,
    x2: clampedX2,
    y2: clampedY2,
  };
}

// Build geometry for a single-page selection. Cross-page selections return
// null so the highlight action can be disabled rather than half-storing.
export function extractSelectionGeometry(
  range: Range,
): PdfSelectionGeometry | null {
  const startPage = findPdfPageElement(range.startContainer);
  const endPage = findPdfPageElement(range.endContainer);
  if (!startPage || !endPage || startPage !== endPage) {
    return null;
  }

  const pageNumber = parsePdfPageNumber(startPage);
  if (pageNumber == null) {
    return null;
  }

  const pageRect = startPage.getBoundingClientRect();
  const clientRects = range.getClientRects();
  const quads: PdfQuad[] = [];
  for (let i = 0; i < clientRects.length; i += 1) {
    const rect = clientRects.item(i);
    if (!rect) {
      continue;
    }
    const quad = clientRectToPageQuad(rect, pageRect);
    if (quad) {
      quads.push(quad);
    }
  }

  if (quads.length === 0) {
    return null;
  }

  return { pageNumber, quads };
}

export function pointInQuad(
  x: number,
  y: number,
  quad: PdfQuad,
  // Optional padding in normalized page space (0–1). Makes thin text lines
  // easier to hit with a right-click.
  pad = 0,
): boolean {
  return (
    x >= quad.x1 - pad &&
    x <= quad.x2 + pad &&
    y >= quad.y1 - pad &&
    y <= quad.y2 + pad
  );
}

// Hit-test page-normalized coordinates against stored highlights. Later entries
// win so overlapping marks match paint order (last drawn is on top).
export function findHighlightAtNormalizedPoint(
  highlights: readonly PdfHighlight[],
  pageNumber: number,
  x: number,
  y: number,
  pad = 0,
): PdfHighlight | null {
  for (let i = highlights.length - 1; i >= 0; i -= 1) {
    const highlight = highlights[i];
    if (!highlight || highlight.pageNumber !== pageNumber) {
      continue;
    }
    for (const quad of highlight.quads) {
      if (pointInQuad(x, y, quad, pad)) {
        return highlight;
      }
    }
  }
  return null;
}

function hitTestPage(
  page: HTMLElement,
  highlights: readonly PdfHighlight[],
  clientX: number,
  clientY: number,
): PdfHighlight | null {
  const pageNumber = parsePdfPageNumber(page);
  if (pageNumber == null) {
    return null;
  }
  const pageRect = page.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return null;
  }
  const x = (clientX - pageRect.left) / pageRect.width;
  const y = (clientY - pageRect.top) / pageRect.height;
  // ~4px tolerance so short lines / subpixel text boxes still hit.
  const pad = Math.max(4 / pageRect.width, 4 / pageRect.height);
  return findHighlightAtNormalizedPoint(highlights, pageNumber, x, y, pad);
}

// Temporarily enable pointer-events on painted highlight rects, sample the
// topmost element under the cursor, then restore. More reliable than pure
// math when page chrome / scale introduce sub-pixel drift.
export function findHighlightIdAtClientPointViaDom(
  root: ParentNode | null | undefined,
  clientX: number,
  clientY: number,
): string | null {
  if (!root || typeof document.elementFromPoint !== "function") {
    return null;
  }
  const layers = root.querySelectorAll<HTMLElement>(".pdf-highlight-layer");
  if (layers.length === 0) {
    return null;
  }

  for (const layer of layers) {
    layer.style.pointerEvents = "auto";
  }
  for (const rect of root.querySelectorAll<HTMLElement>(
    ".pdf-highlight-rect",
  )) {
    rect.style.pointerEvents = "auto";
  }

  let highlightId: string | null = null;
  try {
    const el = document.elementFromPoint(clientX, clientY);
    const rectEl =
      el instanceof Element ? el.closest(".pdf-highlight-rect") : null;
    if (rectEl instanceof HTMLElement) {
      const id = rectEl.dataset.highlightId;
      highlightId = id && id.length > 0 ? id : null;
    }
  } finally {
    for (const layer of layers) {
      layer.style.pointerEvents = "";
    }
    for (const rect of root.querySelectorAll<HTMLElement>(
      ".pdf-highlight-rect",
    )) {
      rect.style.pointerEvents = "";
    }
  }

  return highlightId;
}

// Resolve a client-space click to a stored highlight via the nearest pdf.js
// page root. Tries the event target first, then the full element stack under
// the cursor (pdf.js text-layer targets can sit outside a simple parent walk
// after virtualization reshuffles).
export function findHighlightAtClientPoint(
  highlights: readonly PdfHighlight[],
  clientX: number,
  clientY: number,
  target: EventTarget | null,
  // Optional viewer root for DOM hit-testing of painted highlight rects.
  viewerRoot?: ParentNode | null,
): PdfHighlight | null {
  if (highlights.length === 0) {
    return null;
  }

  // Prefer the painted overlay when available — matches what the user sees.
  if (viewerRoot) {
    const id = findHighlightIdAtClientPointViaDom(viewerRoot, clientX, clientY);
    if (id) {
      const byId = highlights.find((entry) => entry.id === id);
      if (byId) {
        return byId;
      }
    }
  }

  const tried = new Set<HTMLElement>();
  const tryPage = (page: HTMLElement | null): PdfHighlight | null => {
    if (!page || tried.has(page)) {
      return null;
    }
    tried.add(page);
    return hitTestPage(page, highlights, clientX, clientY);
  };

  if (target instanceof Node) {
    const hit = tryPage(findPdfPageElement(target));
    if (hit) {
      return hit;
    }
  }

  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

  for (const el of stack) {
    if (!(el instanceof Node)) {
      continue;
    }
    const hit = tryPage(findPdfPageElement(el));
    if (hit) {
      return hit;
    }
  }

  return null;
}

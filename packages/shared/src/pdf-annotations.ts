// App-side PDF marks (user bookmarks + text highlights). Stored outside the
// PDF file so the workspace document stays read-only and git-clean.

export type PdfHighlightColor = "yellow" | "green" | "blue" | "pink";

// Stable order for color pickers and paint lookup.
export const PDF_HIGHLIGHT_COLORS: readonly PdfHighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
] as const;

export function isPdfHighlightColor(
  value: unknown,
): value is PdfHighlightColor {
  return (
    typeof value === "string" &&
    (PDF_HIGHLIGHT_COLORS as readonly string[]).includes(value)
  );
}

// Axis-aligned box in page space, coordinates normalized to 0–1 relative to
// the rendered page box (not PDF user-space). Survives zoom because painting
// multiplies by the live page width/height.
export interface PdfQuad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfUserBookmark {
  id: string;
  pageNumber: number;
  // Optional user label; when omitted the UI shows a localized page fallback.
  label?: string;
  // Optional vertical position within the page (0 = top, 1 = bottom).
  scrollYRatio?: number;
  createdAt: number;
}

export interface PdfHighlight {
  id: string;
  pageNumber: number;
  color: PdfHighlightColor;
  selectedText: string;
  quads: PdfQuad[];
  createdAt: number;
}

export interface PdfDocumentAnnotations {
  bookmarks: PdfUserBookmark[];
  highlights: PdfHighlight[];
}

export type PdfAnnotationsByPath = Record<string, PdfDocumentAnnotations>;

export const EMPTY_DOCUMENT_ANNOTATIONS: PdfDocumentAnnotations = {
  bookmarks: [],
  highlights: [],
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPageNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizeQuad(value: unknown): PdfQuad | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    !isFiniteNumber(raw.x1) ||
    !isFiniteNumber(raw.y1) ||
    !isFiniteNumber(raw.x2) ||
    !isFiniteNumber(raw.y2)
  ) {
    return null;
  }
  const x1 = clamp01(raw.x1);
  const y1 = clamp01(raw.y1);
  const x2 = clamp01(raw.x2);
  const y2 = clamp01(raw.y2);
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  return { x1, y1, x2, y2 };
}

function normalizeBookmark(value: unknown): PdfUserBookmark | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return null;
  }
  if (!isValidPageNumber(raw.pageNumber)) {
    return null;
  }
  if (!isFiniteNumber(raw.createdAt)) {
    return null;
  }
  const bookmark: PdfUserBookmark = {
    id: raw.id,
    pageNumber: raw.pageNumber,
    createdAt: raw.createdAt,
  };
  if (typeof raw.label === "string" && raw.label.trim().length > 0) {
    bookmark.label = raw.label.trim();
  }
  if (isFiniteNumber(raw.scrollYRatio)) {
    bookmark.scrollYRatio = clamp01(raw.scrollYRatio);
  }
  return bookmark;
}

function normalizeHighlight(value: unknown): PdfHighlight | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return null;
  }
  if (!isValidPageNumber(raw.pageNumber)) {
    return null;
  }
  if (typeof raw.selectedText !== "string" || raw.selectedText.length === 0) {
    return null;
  }
  if (!isPdfHighlightColor(raw.color)) {
    return null;
  }
  if (!isFiniteNumber(raw.createdAt)) {
    return null;
  }
  if (!Array.isArray(raw.quads)) {
    return null;
  }
  const quads: PdfQuad[] = [];
  for (const entry of raw.quads) {
    const quad = normalizeQuad(entry);
    if (quad) {
      quads.push(quad);
    }
  }
  if (quads.length === 0) {
    return null;
  }
  return {
    id: raw.id,
    pageNumber: raw.pageNumber,
    color: raw.color as PdfHighlightColor,
    selectedText: raw.selectedText,
    quads,
    createdAt: raw.createdAt,
  };
}

export function normalizeDocumentAnnotations(
  value: unknown,
): PdfDocumentAnnotations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { bookmarks: [], highlights: [] };
  }
  const raw = value as Record<string, unknown>;
  const bookmarks: PdfUserBookmark[] = [];
  const seenBookmarkIds = new Set<string>();
  if (Array.isArray(raw.bookmarks)) {
    for (const entry of raw.bookmarks) {
      const bookmark = normalizeBookmark(entry);
      if (!bookmark || seenBookmarkIds.has(bookmark.id)) {
        continue;
      }
      seenBookmarkIds.add(bookmark.id);
      bookmarks.push(bookmark);
    }
  }
  bookmarks.sort(
    (a, b) => a.pageNumber - b.pageNumber || a.createdAt - b.createdAt,
  );

  const highlights: PdfHighlight[] = [];
  const seenHighlightIds = new Set<string>();
  if (Array.isArray(raw.highlights)) {
    for (const entry of raw.highlights) {
      const highlight = normalizeHighlight(entry);
      if (!highlight || seenHighlightIds.has(highlight.id)) {
        continue;
      }
      seenHighlightIds.add(highlight.id);
      highlights.push(highlight);
    }
  }
  highlights.sort(
    (a, b) => a.pageNumber - b.pageNumber || a.createdAt - b.createdAt,
  );

  return { bookmarks, highlights };
}

export function normalizeAnnotationsByPath(
  value: unknown,
): PdfAnnotationsByPath {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: PdfAnnotationsByPath = {};
  for (const [path, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (path.length === 0) {
      continue;
    }
    const doc = normalizeDocumentAnnotations(entry);
    if (doc.bookmarks.length === 0 && doc.highlights.length === 0) {
      continue;
    }
    result[path] = doc;
  }
  return result;
}

export function getDocumentAnnotations(
  byPath: PdfAnnotationsByPath,
  filePath: string,
): PdfDocumentAnnotations {
  return byPath[filePath] ?? EMPTY_DOCUMENT_ANNOTATIONS;
}

export function createBookmark(input: {
  pageNumber: number;
  label?: string;
  scrollYRatio?: number;
  id?: string;
  createdAt?: number;
}): PdfUserBookmark | null {
  const pageNumber = Math.floor(input.pageNumber);
  if (pageNumber < 1) {
    return null;
  }
  const bookmark: PdfUserBookmark = {
    id: input.id ?? crypto.randomUUID(),
    pageNumber,
    createdAt: input.createdAt ?? Date.now(),
  };
  if (input.label && input.label.trim().length > 0) {
    bookmark.label = input.label.trim();
  }
  if (
    typeof input.scrollYRatio === "number" &&
    Number.isFinite(input.scrollYRatio)
  ) {
    bookmark.scrollYRatio = clamp01(input.scrollYRatio);
  }
  return bookmark;
}

export function createHighlight(input: {
  pageNumber: number;
  selectedText: string;
  quads: PdfQuad[];
  color?: PdfHighlightColor;
  id?: string;
  createdAt?: number;
}): PdfHighlight | null {
  const pageNumber = Math.floor(input.pageNumber);
  if (pageNumber < 1) {
    return null;
  }
  const selectedText = input.selectedText;
  if (typeof selectedText !== "string" || selectedText.trim().length === 0) {
    return null;
  }
  const quads: PdfQuad[] = [];
  for (const entry of input.quads) {
    const quad = normalizeQuad(entry);
    if (quad) {
      quads.push(quad);
    }
  }
  if (quads.length === 0) {
    return null;
  }
  return {
    id: input.id ?? crypto.randomUUID(),
    pageNumber,
    color: input.color ?? "yellow",
    selectedText,
    quads,
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function addBookmarkToDocument(
  doc: PdfDocumentAnnotations,
  bookmark: PdfUserBookmark,
): PdfDocumentAnnotations {
  // One bookmark per page: replacing keeps the list small and the toolbar
  // toggle predictable (pin / unpin the current page).
  const withoutPage = doc.bookmarks.filter(
    (entry) => entry.pageNumber !== bookmark.pageNumber,
  );
  const bookmarks = [...withoutPage, bookmark].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.createdAt - b.createdAt,
  );
  return { ...doc, bookmarks };
}

export function removeBookmarkFromDocument(
  doc: PdfDocumentAnnotations,
  bookmarkId: string,
): PdfDocumentAnnotations {
  return {
    ...doc,
    bookmarks: doc.bookmarks.filter((entry) => entry.id !== bookmarkId),
  };
}

export function removeBookmarkForPage(
  doc: PdfDocumentAnnotations,
  pageNumber: number,
): PdfDocumentAnnotations {
  return {
    ...doc,
    bookmarks: doc.bookmarks.filter((entry) => entry.pageNumber !== pageNumber),
  };
}

export function findBookmarkForPage(
  doc: PdfDocumentAnnotations,
  pageNumber: number,
): PdfUserBookmark | undefined {
  return doc.bookmarks.find((entry) => entry.pageNumber === pageNumber);
}

export function addHighlightToDocument(
  doc: PdfDocumentAnnotations,
  highlight: PdfHighlight,
): PdfDocumentAnnotations {
  if (doc.highlights.some((entry) => entry.id === highlight.id)) {
    return doc;
  }
  const highlights = [...doc.highlights, highlight].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.createdAt - b.createdAt,
  );
  return { ...doc, highlights };
}

export function removeHighlightFromDocument(
  doc: PdfDocumentAnnotations,
  highlightId: string,
): PdfDocumentAnnotations {
  return {
    ...doc,
    highlights: doc.highlights.filter((entry) => entry.id !== highlightId),
  };
}

export function setDocumentAnnotations(
  byPath: PdfAnnotationsByPath,
  filePath: string,
  doc: PdfDocumentAnnotations,
): PdfAnnotationsByPath {
  if (!filePath) {
    return byPath;
  }
  if (doc.bookmarks.length === 0 && doc.highlights.length === 0) {
    if (!(filePath in byPath)) {
      return byPath;
    }
    const next = { ...byPath };
    delete next[filePath];
    return next;
  }
  return {
    ...byPath,
    [filePath]: doc,
  };
}

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { bumpRightPanelRevealAtom } from "@/app/layout/right-panel-reveal";
import { desktopApi } from "@/lib";
import {
  addBookmarkToDocument,
  addHighlightToDocument,
  createBookmark,
  createHighlight,
  findBookmarkForPage,
  getDocumentAnnotations,
  isPdfHighlightColor,
  normalizeAnnotationsByPath,
  normalizeDocumentAnnotations,
  type PdfAnnotationsByPath,
  type PdfDocumentAnnotations,
  type PdfHighlight,
  type PdfHighlightColor,
  type PdfQuad,
  type PdfUserBookmark,
  removeBookmarkForPage,
  removeBookmarkFromDocument,
  removeHighlightFromDocument,
  setDocumentAnnotations,
} from "./pdf-annotations";
import {
  normalizeOpenPaths,
  normalizeReadingPositions,
  type PdfReadingPosition,
  type PdfReadingPositions,
} from "./pdf-reading-position";
import {
  normalizePdfSidePanelWidth,
  PDF_SIDE_PANEL_DEFAULT_WIDTH,
} from "./pdf-side-panel-width";

export const PDF_OPEN_PATHS_KEY = "cocurdex.pdf.openPaths";
export const PDF_ACTIVE_PATH_KEY = "cocurdex.pdf.activePath";
export const PDF_READING_POSITIONS_KEY = "cocurdex.pdf.readingPositions";
// Legacy localStorage key — one-shot migration into userData, then removed.
export const PDF_ANNOTATIONS_KEY = "cocurdex.pdf.annotations";
export const PDF_LAST_HIGHLIGHT_COLOR_KEY = "cocurdex.pdf.lastHighlightColor";
export const PDF_SIDE_PANEL_WIDTH_KEY = "cocurdex.pdf.sidePanelWidth";

// Absolute file paths of the PDFs open in the reader. Workspace authorization
// happens entirely in the main process, so the renderer only tracks paths.
// Persisted so open tabs survive app restarts and right-panel remounts.
const storedOpenPdfsAtom = atomWithStorage<string[]>(
  PDF_OPEN_PATHS_KEY,
  [],
  undefined,
  { getOnInit: true },
);

export const openPdfsAtom = atom(
  (get) => normalizeOpenPaths(get(storedOpenPdfsAtom)),
  (_get, set, next: string[]) => {
    set(storedOpenPdfsAtom, normalizeOpenPaths(next));
  },
);

const storedActivePdfPathAtom = atomWithStorage<string | null>(
  PDF_ACTIVE_PATH_KEY,
  null,
  undefined,
  { getOnInit: true },
);

export const activePdfPathAtom = atom(
  (get) => {
    const path = get(storedActivePdfPathAtom);
    return typeof path === "string" && path.length > 0 ? path : null;
  },
  (_get, set, next: string | null) => {
    set(storedActivePdfPathAtom, next && next.length > 0 ? next : null);
  },
);

// Active path, but only while it is still in the open list.
export const activeOpenPdfPathAtom = atom<string | null>((get) => {
  const activePath = get(activePdfPathAtom);
  if (!activePath) {
    return null;
  }
  return get(openPdfsAtom).includes(activePath) ? activePath : null;
});

export const pdfReaderRevealNonceAtom = atom(0);

// Last page the user was reading per absolute path. Survives tab switches and
// app restarts so reopening a PDF lands on the prior page instead of page 1.
const storedReadingPositionsAtom = atomWithStorage<PdfReadingPositions>(
  PDF_READING_POSITIONS_KEY,
  {},
  undefined,
  { getOnInit: true },
);

export const pdfReadingPositionsAtom = atom(
  (get) => normalizeReadingPositions(get(storedReadingPositionsAtom)),
  (_get, set, next: PdfReadingPositions) => {
    set(storedReadingPositionsAtom, normalizeReadingPositions(next));
  },
);

export const setPdfReadingPositionAtom = atom(
  null,
  (get, set, payload: { filePath: string; position: PdfReadingPosition }) => {
    const { filePath } = payload;
    const page = Math.floor(payload.position.page);
    if (!filePath || page < 1) {
      return;
    }
    const next: PdfReadingPosition = {
      page,
      top: payload.position.top,
      left: payload.position.left,
    };
    const current = get(pdfReadingPositionsAtom);
    const previous = current[filePath];
    if (
      previous &&
      previous.page === next.page &&
      previous.top === next.top &&
      previous.left === next.left
    ) {
      return;
    }
    set(pdfReadingPositionsAtom, {
      ...current,
      [filePath]: next,
    });
  },
);

// Remembers the last color the user picked so the toolbar can emphasize it.
const storedLastHighlightColorAtom = atomWithStorage<PdfHighlightColor>(
  PDF_LAST_HIGHLIGHT_COLOR_KEY,
  "yellow",
  undefined,
  { getOnInit: true },
);

export const pdfLastHighlightColorAtom = atom(
  (get) => {
    const value = get(storedLastHighlightColorAtom);
    return isPdfHighlightColor(value) ? value : "yellow";
  },
  (_get, set, next: PdfHighlightColor) => {
    if (isPdfHighlightColor(next)) {
      set(storedLastHighlightColorAtom, next);
    }
  },
);

// Shared left-rail width for outline / marks / thumbnails. Persisted so the
// drawer size survives restarts like other PDF reader preferences.
const storedSidePanelWidthAtom = atomWithStorage<number>(
  PDF_SIDE_PANEL_WIDTH_KEY,
  PDF_SIDE_PANEL_DEFAULT_WIDTH,
  undefined,
  { getOnInit: true },
);

export const pdfSidePanelWidthAtom = atom(
  (get) => normalizePdfSidePanelWidth(get(storedSidePanelWidthAtom)),
  (_get, set, next: number) => {
    set(storedSidePanelWidthAtom, normalizePdfSidePanelWidth(next));
  },
);

// Per-document bookmarks + highlights. In-memory cache of app-private storage
// under userData (not the PDF file, not localStorage). Tab close never drops
// marks; workspace files stay unmodified.
export const pdfAnnotationsAtom = atom<PdfAnnotationsByPath>({});

const hydratedAnnotationPaths = new Set<string>();
const inflightAnnotationLoads = new Map<string, Promise<void>>();
let legacyAnnotationsMigration: Promise<void> | null = null;

function persistDocumentAnnotations(
  filePath: string,
  byPath: PdfAnnotationsByPath,
) {
  const annotations = getDocumentAnnotations(byPath, filePath);
  void desktopApi
    .savePdfAnnotations({ filePath, annotations })
    .catch((error: unknown) => {
      console.error("[pdf] save annotations failed", error);
    });
}

function writeDocumentAnnotations(
  get: (atom: typeof pdfAnnotationsAtom) => PdfAnnotationsByPath,
  set: (atom: typeof pdfAnnotationsAtom, next: PdfAnnotationsByPath) => void,
  filePath: string,
  doc: PdfDocumentAnnotations,
) {
  const next = setDocumentAnnotations(get(pdfAnnotationsAtom), filePath, doc);
  set(pdfAnnotationsAtom, next);
  hydratedAnnotationPaths.add(filePath);
  persistDocumentAnnotations(filePath, next);
}

async function migrateLegacyLocalStorageAnnotations(
  set: (atom: typeof pdfAnnotationsAtom, next: PdfAnnotationsByPath) => void,
  get: (atom: typeof pdfAnnotationsAtom) => PdfAnnotationsByPath,
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PDF_ANNOTATIONS_KEY);
  } catch {
    return;
  }
  if (!raw) {
    return;
  }

  let byPath: PdfAnnotationsByPath = {};
  try {
    byPath = normalizeAnnotationsByPath(JSON.parse(raw) as unknown);
  } catch {
    try {
      window.localStorage.removeItem(PDF_ANNOTATIONS_KEY);
    } catch {
      // ignore
    }
    return;
  }

  const entries = Object.entries(byPath);
  for (const [filePath, doc] of entries) {
    try {
      await desktopApi.savePdfAnnotations({ filePath, annotations: doc });
      hydratedAnnotationPaths.add(filePath);
    } catch (error) {
      console.error("[pdf] migrate annotations failed", { filePath, error });
    }
  }

  // Seed the in-memory cache so the open document paints marks without a
  // second load when migration just finished.
  const current = get(pdfAnnotationsAtom);
  let merged = current;
  for (const [filePath, doc] of entries) {
    if (!(filePath in merged)) {
      merged = setDocumentAnnotations(merged, filePath, doc);
    }
  }
  if (merged !== current) {
    set(pdfAnnotationsAtom, merged);
  }

  try {
    window.localStorage.removeItem(PDF_ANNOTATIONS_KEY);
  } catch {
    // ignore
  }
}

function ensureLegacyAnnotationsMigration(
  get: (atom: typeof pdfAnnotationsAtom) => PdfAnnotationsByPath,
  set: (atom: typeof pdfAnnotationsAtom, next: PdfAnnotationsByPath) => void,
): Promise<void> {
  if (!legacyAnnotationsMigration) {
    legacyAnnotationsMigration = migrateLegacyLocalStorageAnnotations(
      set,
      get,
    ).catch((error: unknown) => {
      console.error("[pdf] legacy annotations migration failed", error);
    });
  }
  return legacyAnnotationsMigration;
}

// Load marks for a PDF path from userData. Safe to call repeatedly; concurrent
// loads coalesce and local optimistic writes win over a late disk response.
export const hydratePdfAnnotationsAtom = atom(
  null,
  async (get, set, filePath: string) => {
    if (!filePath) {
      return;
    }

    await ensureLegacyAnnotationsMigration(get, set);

    if (hydratedAnnotationPaths.has(filePath)) {
      return;
    }

    const existing = inflightAnnotationLoads.get(filePath);
    if (existing) {
      await existing;
      return;
    }

    const load = (async () => {
      try {
        const loaded = await desktopApi.loadPdfAnnotations({ filePath });
        const doc = normalizeDocumentAnnotations(loaded);
        // Optimistic local writes that raced the load keep their data.
        if (filePath in get(pdfAnnotationsAtom)) {
          hydratedAnnotationPaths.add(filePath);
          return;
        }
        if (doc.bookmarks.length > 0 || doc.highlights.length > 0) {
          set(
            pdfAnnotationsAtom,
            setDocumentAnnotations(get(pdfAnnotationsAtom), filePath, doc),
          );
        }
        hydratedAnnotationPaths.add(filePath);
      } catch (error) {
        console.error("[pdf] load annotations failed", { filePath, error });
      } finally {
        inflightAnnotationLoads.delete(filePath);
      }
    })();

    inflightAnnotationLoads.set(filePath, load);
    await load;
  },
);

// Test helper: clear hydration tracking between unit tests.
export function resetPdfAnnotationsHydrationStateForTests() {
  hydratedAnnotationPaths.clear();
  inflightAnnotationLoads.clear();
  legacyAnnotationsMigration = null;
}

export const addPdfBookmarkAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      filePath: string;
      pageNumber: number;
      label?: string;
      scrollYRatio?: number;
    },
  ): PdfUserBookmark | null => {
    const { filePath } = payload;
    const bookmark = createBookmark({
      pageNumber: payload.pageNumber,
      label: payload.label,
      scrollYRatio: payload.scrollYRatio,
    });
    if (!filePath || !bookmark) {
      return null;
    }
    const byPath = get(pdfAnnotationsAtom);
    const doc = getDocumentAnnotations(byPath, filePath);
    writeDocumentAnnotations(
      get,
      set,
      filePath,
      addBookmarkToDocument(doc, bookmark),
    );
    return bookmark;
  },
);

export const togglePdfBookmarkForPageAtom = atom(
  null,
  (
    get,
    set,
    payload: { filePath: string; pageNumber: number; label?: string },
  ): "added" | "removed" | null => {
    const { filePath, pageNumber } = payload;
    if (!filePath || pageNumber < 1) {
      return null;
    }
    const byPath = get(pdfAnnotationsAtom);
    const doc = getDocumentAnnotations(byPath, filePath);
    const existing = findBookmarkForPage(doc, pageNumber);
    if (existing) {
      writeDocumentAnnotations(
        get,
        set,
        filePath,
        removeBookmarkForPage(doc, pageNumber),
      );
      return "removed";
    }
    const bookmark = createBookmark({
      pageNumber,
      label: payload.label,
    });
    if (!bookmark) {
      return null;
    }
    writeDocumentAnnotations(
      get,
      set,
      filePath,
      addBookmarkToDocument(doc, bookmark),
    );
    return "added";
  },
);

export const removePdfBookmarkAtom = atom(
  null,
  (get, set, payload: { filePath: string; bookmarkId: string }) => {
    const { filePath, bookmarkId } = payload;
    if (!filePath || !bookmarkId) {
      return;
    }
    const byPath = get(pdfAnnotationsAtom);
    const doc = getDocumentAnnotations(byPath, filePath);
    writeDocumentAnnotations(
      get,
      set,
      filePath,
      removeBookmarkFromDocument(doc, bookmarkId),
    );
  },
);

export const addPdfHighlightAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      filePath: string;
      pageNumber: number;
      selectedText: string;
      quads: PdfQuad[];
      color?: PdfHighlightColor;
    },
  ): PdfHighlight | null => {
    const { filePath } = payload;
    const highlight = createHighlight({
      pageNumber: payload.pageNumber,
      selectedText: payload.selectedText,
      quads: payload.quads,
      color: payload.color,
    });
    if (!filePath || !highlight) {
      return null;
    }
    const byPath = get(pdfAnnotationsAtom);
    const doc = getDocumentAnnotations(byPath, filePath);
    writeDocumentAnnotations(
      get,
      set,
      filePath,
      addHighlightToDocument(doc, highlight),
    );
    set(pdfLastHighlightColorAtom, highlight.color);
    return highlight;
  },
);

export const removePdfHighlightAtom = atom(
  null,
  (get, set, payload: { filePath: string; highlightId: string }) => {
    const { filePath, highlightId } = payload;
    if (!filePath || !highlightId) {
      return;
    }
    const byPath = get(pdfAnnotationsAtom);
    const doc = getDocumentAnnotations(byPath, filePath);
    writeDocumentAnnotations(
      get,
      set,
      filePath,
      removeHighlightFromDocument(doc, highlightId),
    );
  },
);

export const openPdfReaderAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openPdfsAtom);
  if (!current.includes(filePath)) {
    set(openPdfsAtom, [...current, filePath]);
  }
  set(activePdfPathAtom, filePath);
  set(pdfReaderRevealNonceAtom, get(pdfReaderRevealNonceAtom) + 1);
  set(bumpRightPanelRevealAtom, "pdf");
  void set(hydratePdfAnnotationsAtom, filePath);
});

// Open a PDF and optionally land on a page. Sets the reading position first so
// a remounted viewer seeds initialPage correctly (same path as resume reading).
export const openPdfAtPageAtom = atom(
  null,
  (_get, set, payload: { filePath: string; pageNumber?: number | null }) => {
    const { filePath } = payload;
    if (!filePath) {
      return;
    }
    const pageNumber = payload.pageNumber;
    if (
      typeof pageNumber === "number" &&
      Number.isInteger(pageNumber) &&
      pageNumber >= 1
    ) {
      set(setPdfReadingPositionAtom, {
        filePath,
        position: { page: pageNumber, top: 0, left: 0 },
      });
    }
    set(openPdfReaderAtom, filePath);
  },
);

export const setActivePdfAtom = atom(null, (_get, set, filePath: string) => {
  set(activePdfPathAtom, filePath);
  void set(hydratePdfAnnotationsAtom, filePath);
});

export const closePdfAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openPdfsAtom);
  const nextOpen = current.filter((path) => path !== filePath);
  set(openPdfsAtom, nextOpen);

  if (get(activePdfPathAtom) !== filePath) {
    return;
  }

  const closedIndex = current.indexOf(filePath);
  const nextActive =
    nextOpen[closedIndex] ?? nextOpen[closedIndex - 1] ?? nextOpen[0] ?? null;

  set(activePdfPathAtom, nextActive);
  if (nextActive) {
    void set(hydratePdfAnnotationsAtom, nextActive);
  }
});

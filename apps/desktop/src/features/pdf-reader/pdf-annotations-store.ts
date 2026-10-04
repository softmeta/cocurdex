import { atom, type Getter, type Setter } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { desktopApi } from "@/lib";
import {
  applyPdfAnnotationsOperation,
  createBookmark,
  createHighlight,
  findBookmarkForPage,
  getDocumentAnnotations,
  isPdfHighlightColor,
  normalizeAnnotationsByPath,
  normalizeDocumentAnnotations,
  type PdfAnnotationsByPath,
  type PdfAnnotationsOperation,
  type PdfDocumentAnnotations,
  type PdfHighlight,
  type PdfHighlightColor,
  type PdfQuad,
  setDocumentAnnotations,
} from "./pdf-annotations";

// Legacy localStorage key — one-shot migration into userData, then removed.
export const PDF_ANNOTATIONS_KEY = "cocurdex.pdf.annotations";
export const PDF_LAST_HIGHLIGHT_COLOR_KEY = "cocurdex.pdf.lastHighlightColor";

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

// Per-document bookmarks + highlights: a client cache of daemon-owned storage.
// Mutations are sent to the daemon as operations, never as whole snapshots, so
// a cache that is stale or still loading cannot overwrite stored marks.
export const pdfAnnotationsAtom = atom<PdfAnnotationsByPath>({});

interface PathSyncState {
  pendingMutations: number;
  revision: number;
}

const syncStates = new Map<string, PathSyncState>();
const inflightLoads = new Map<string, Promise<void>>();
let legacyAnnotationsMigration: Promise<void> | null = null;

function syncStateFor(filePath: string): PathSyncState {
  let state = syncStates.get(filePath);
  if (!state) {
    state = { pendingMutations: 0, revision: 0 };
    syncStates.set(filePath, state);
  }
  return state;
}

function writeCachedDocument(
  get: Getter,
  set: Setter,
  filePath: string,
  doc: PdfDocumentAnnotations,
) {
  set(
    pdfAnnotationsAtom,
    setDocumentAnnotations(get(pdfAnnotationsAtom), filePath, doc),
  );
}

async function loadDocument(get: Getter, set: Setter, filePath: string) {
  const state = syncStateFor(filePath);
  const revision = state.revision;
  try {
    const loaded = await desktopApi.loadPdfAnnotations({ filePath });
    if (state.revision !== revision || state.pendingMutations > 0) {
      return;
    }
    writeCachedDocument(
      get,
      set,
      filePath,
      normalizeDocumentAnnotations(loaded),
    );
  } catch (error) {
    console.error("[pdf] load annotations failed", { filePath, error });
  }
}

function reloadDocument(get: Getter, set: Setter, filePath: string) {
  const existing = inflightLoads.get(filePath);
  if (existing) {
    return existing;
  }
  const load = loadDocument(get, set, filePath).finally(() => {
    inflightLoads.delete(filePath);
  });
  inflightLoads.set(filePath, load);
  return load;
}

// Applies the operation to the cache immediately, then adopts the daemon's
// resulting document once no other mutation for the path is in flight.
function mutateDocument(
  get: Getter,
  set: Setter,
  filePath: string,
  operation: PdfAnnotationsOperation,
): Promise<boolean> {
  const state = syncStateFor(filePath);
  state.revision += 1;
  state.pendingMutations += 1;
  const current = getDocumentAnnotations(get(pdfAnnotationsAtom), filePath);
  writeCachedDocument(
    get,
    set,
    filePath,
    applyPdfAnnotationsOperation(current, operation),
  );

  return desktopApi
    .updatePdfAnnotations({ filePath, operation })
    .then((stored) => {
      state.pendingMutations -= 1;
      if (state.pendingMutations === 0) {
        writeCachedDocument(
          get,
          set,
          filePath,
          normalizeDocumentAnnotations(stored),
        );
      }
      return true;
    })
    .catch((error: unknown) => {
      state.pendingMutations -= 1;
      console.error("[pdf] update annotations failed", { filePath, error });
      if (state.pendingMutations === 0) {
        state.revision += 1;
        void reloadDocument(get, set, filePath);
      }
      return false;
    });
}

function readLegacyAnnotations(): PdfAnnotationsByPath | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PDF_ANNOTATIONS_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    return normalizeAnnotationsByPath(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

async function migrateLegacyLocalStorageAnnotations(
  get: Getter,
  set: Setter,
): Promise<void> {
  const byPath = readLegacyAnnotations();
  if (!byPath) {
    return;
  }
  const results = await Promise.all(
    Object.entries(byPath).map(([filePath, annotations]) =>
      mutateDocument(get, set, filePath, { type: "merge", annotations }),
    ),
  );
  if (results.every(Boolean)) {
    try {
      window.localStorage.removeItem(PDF_ANNOTATIONS_KEY);
    } catch {
      // ignore
    }
  }
}

function ensureLegacyAnnotationsMigration(get: Getter, set: Setter) {
  if (!legacyAnnotationsMigration) {
    legacyAnnotationsMigration = migrateLegacyLocalStorageAnnotations(
      get,
      set,
    ).catch((error: unknown) => {
      console.error("[pdf] legacy annotations migration failed", error);
    });
  }
  return legacyAnnotationsMigration;
}

// Refreshes marks for a PDF from the daemon. Concurrent calls coalesce, and a
// response is dropped when a local mutation started after the request.
export const hydratePdfAnnotationsAtom = atom(
  null,
  async (get, set, filePath: string) => {
    if (!filePath) {
      return;
    }
    await ensureLegacyAnnotationsMigration(get, set);
    await reloadDocument(get, set, filePath);
  },
);

// Test helper: clear sync tracking between unit tests.
export function resetPdfAnnotationsSyncStateForTests() {
  syncStates.clear();
  inflightLoads.clear();
  legacyAnnotationsMigration = null;
}

export const togglePdfBookmarkForPageAtom = atom(
  null,
  (
    get,
    set,
    payload: { filePath: string; pageNumber: number; label?: string },
  ): "added" | "removed" | null => {
    const { filePath, pageNumber } = payload;
    const bookmark = createBookmark({ pageNumber, label: payload.label });
    if (!filePath || !bookmark) {
      return null;
    }
    const doc = getDocumentAnnotations(get(pdfAnnotationsAtom), filePath);
    const result = findBookmarkForPage(doc, bookmark.pageNumber)
      ? "removed"
      : "added";
    void mutateDocument(get, set, filePath, {
      type: "toggleBookmark",
      bookmark,
    });
    return result;
  },
);

export const removePdfBookmarkAtom = atom(
  null,
  (get, set, payload: { filePath: string; bookmarkId: string }) => {
    const { filePath, bookmarkId } = payload;
    if (!filePath || !bookmarkId) {
      return;
    }
    void mutateDocument(get, set, filePath, {
      type: "removeBookmark",
      bookmarkId,
    });
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
    void mutateDocument(get, set, filePath, {
      type: "addHighlight",
      highlight,
    });
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
    void mutateDocument(get, set, filePath, {
      type: "removeHighlight",
      highlightId,
    });
  },
);

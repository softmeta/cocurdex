import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { bumpRightPanelRevealAtom } from "@/app/layout/right-panel-reveal";
import { hydratePdfAnnotationsAtom } from "./pdf-annotations-store";
import {
  normalizeOpenPaths,
  normalizeReadingPositions,
  type PdfReadingPosition,
  type PdfReadingPositions,
  retainOpenPdfPaths,
} from "./pdf-reading-position";
import {
  normalizePdfSidePanelWidth,
  PDF_SIDE_PANEL_DEFAULT_WIDTH,
} from "./pdf-side-panel-width";

export const PDF_OPEN_PATHS_KEY = "cocurdex.pdf.openPaths";
export const PDF_ACTIVE_PATH_KEY = "cocurdex.pdf.activePath";
export const PDF_READING_POSITIONS_KEY = "cocurdex.pdf.readingPositions";
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

export const reconcileOpenPdfsWithWorkspaceRootsAtom = atom(
  null,
  (get, set, workspaceRootPaths: readonly string[]) => {
    const current = get(openPdfsAtom);
    const nextOpen = retainOpenPdfPaths(current, workspaceRootPaths);
    if (
      nextOpen.length === current.length &&
      nextOpen.every((filePath, index) => filePath === current[index])
    ) {
      return;
    }
    set(openPdfsAtom, nextOpen);
    const activePath = get(activePdfPathAtom);
    if (activePath && !nextOpen.includes(activePath)) {
      set(activePdfPathAtom, nextOpen[0] ?? null);
    }
  },
);

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

import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeOpenPdfPathAtom,
  activePdfPathAtom,
  addPdfHighlightAtom,
  closePdfAtom,
  hydratePdfAnnotationsAtom,
  openPdfAtPageAtom,
  openPdfReaderAtom,
  openPdfsAtom,
  PDF_ACTIVE_PATH_KEY,
  PDF_ANNOTATIONS_KEY,
  PDF_LAST_HIGHLIGHT_COLOR_KEY,
  PDF_OPEN_PATHS_KEY,
  PDF_READING_POSITIONS_KEY,
  PDF_SIDE_PANEL_WIDTH_KEY,
  pdfAnnotationsAtom,
  pdfLastHighlightColorAtom,
  pdfReaderRevealNonceAtom,
  pdfReadingPositionsAtom,
  pdfSidePanelWidthAtom,
  removePdfHighlightAtom,
  resetPdfAnnotationsHydrationStateForTests,
  setActivePdfAtom,
  setPdfReadingPositionAtom,
  togglePdfBookmarkForPageAtom,
} from "@/features/pdf-reader/pdf-reader-store";

const targetA = "/workspace/a.pdf";

const targetB = "/workspace/b.pdf";

const targetC = "/workspace/c.pdf";

type PdfDocumentAnnotationsDto = {
  bookmarks: Array<{ id: string; pageNumber: number; createdAt: number }>;
  highlights: unknown[];
};

type PdfAnnotationsPayload = {
  filePath: string;
  annotations: PdfDocumentAnnotationsDto;
};

const savePdfAnnotations = vi.fn(
  async (_payload: PdfAnnotationsPayload): Promise<void> => {},
);
const loadPdfAnnotations = vi.fn(
  async (_payload: {
    filePath: string;
  }): Promise<PdfDocumentAnnotationsDto> => ({
    bookmarks: [],
    highlights: [],
  }),
);

beforeEach(() => {
  window.localStorage.removeItem(PDF_OPEN_PATHS_KEY);
  window.localStorage.removeItem(PDF_ACTIVE_PATH_KEY);
  window.localStorage.removeItem(PDF_READING_POSITIONS_KEY);
  window.localStorage.removeItem(PDF_ANNOTATIONS_KEY);
  window.localStorage.removeItem(PDF_LAST_HIGHLIGHT_COLOR_KEY);
  window.localStorage.removeItem(PDF_SIDE_PANEL_WIDTH_KEY);
  resetPdfAnnotationsHydrationStateForTests();
  savePdfAnnotations.mockClear();
  loadPdfAnnotations.mockClear();
  loadPdfAnnotations.mockResolvedValue({ bookmarks: [], highlights: [] });
  (
    window as unknown as {
      desktopApi: {
        savePdfAnnotations: typeof savePdfAnnotations;
        loadPdfAnnotations: typeof loadPdfAnnotations;
      };
    }
  ).desktopApi = {
    savePdfAnnotations,
    loadPdfAnnotations,
  };
});

describe("openPdfReaderAtom", () => {
  it("adds the target and activates it", () => {
    const store = createStore();
    expect(store.get(openPdfsAtom)).toEqual([]);

    store.set(openPdfReaderAtom, targetA);

    expect(store.get(openPdfsAtom)).toEqual([targetA]);
    expect(store.get(activePdfPathAtom)).toBe(targetA);
    expect(store.get(activeOpenPdfPathAtom)).toEqual(targetA);
  });

  it("does not duplicate an already-open path", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(openPdfReaderAtom, targetA);

    expect(store.get(openPdfsAtom)).toEqual([targetA]);
  });

  it("bumps the reveal nonce so the viewer remounts", () => {
    const store = createStore();
    const before = store.get(pdfReaderRevealNonceAtom);
    store.set(openPdfReaderAtom, targetA);
    expect(store.get(pdfReaderRevealNonceAtom)).toBe(before + 1);
    store.set(openPdfReaderAtom, targetA);
    expect(store.get(pdfReaderRevealNonceAtom)).toBe(before + 2);
  });
});

describe("setActivePdfAtom / closePdfAtom", () => {
  it("activates an open path", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(openPdfReaderAtom, targetB);
    store.set(setActivePdfAtom, targetA);

    expect(store.get(activePdfPathAtom)).toBe(targetA);
    expect(store.get(activeOpenPdfPathAtom)).toEqual(targetA);
  });

  it("closes the active tab and selects a neighbor", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(openPdfReaderAtom, targetB);
    store.set(openPdfReaderAtom, targetC);
    store.set(setActivePdfAtom, targetB);

    store.set(closePdfAtom, targetB);

    expect(store.get(openPdfsAtom)).toEqual([targetA, targetC]);
    expect(store.get(activePdfPathAtom)).toBe(targetC);
  });

  it("clears active path when the last tab closes", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(closePdfAtom, targetA);

    expect(store.get(openPdfsAtom)).toEqual([]);
    expect(store.get(activePdfPathAtom)).toBeNull();
    expect(store.get(activeOpenPdfPathAtom)).toBeNull();
  });
});

describe("openPdfAtPageAtom", () => {
  it("opens the PDF and seeds the reading position", () => {
    const store = createStore();
    store.set(openPdfAtPageAtom, { filePath: targetA, pageNumber: 7 });

    expect(store.get(openPdfsAtom)).toEqual([targetA]);
    expect(store.get(activePdfPathAtom)).toBe(targetA);
    expect(store.get(pdfReadingPositionsAtom)).toEqual({
      [targetA]: { page: 7, top: 0, left: 0 },
    });
  });
});

describe("pdf open session persistence", () => {
  it("writes open paths and active path to localStorage", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(openPdfReaderAtom, targetB);

    expect(
      JSON.parse(window.localStorage.getItem(PDF_OPEN_PATHS_KEY) ?? "[]"),
    ).toEqual([targetA, targetB]);
    expect(
      JSON.parse(window.localStorage.getItem(PDF_ACTIVE_PATH_KEY) ?? "null"),
    ).toBe(targetB);
  });

  it("writes reading positions to localStorage", () => {
    const store = createStore();
    store.set(setPdfReadingPositionAtom, {
      filePath: targetA,
      position: { page: 11, top: 320, left: 0 },
    });

    expect(store.get(pdfReadingPositionsAtom)).toEqual({
      [targetA]: { page: 11, top: 320, left: 0 },
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(PDF_READING_POSITIONS_KEY) ?? "{}",
      ),
    ).toEqual({ [targetA]: { page: 11, top: 320, left: 0 } });
  });
});

describe("pdf annotations atoms", () => {
  const sampleQuad = { x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.25 };

  it("toggles a page bookmark and persists it via IPC", async () => {
    const store = createStore();

    expect(
      store.set(togglePdfBookmarkForPageAtom, {
        filePath: targetA,
        pageNumber: 3,
      }),
    ).toBe("added");
    expect(store.get(pdfAnnotationsAtom)[targetA]?.bookmarks).toHaveLength(1);
    await vi.waitFor(() => {
      expect(savePdfAnnotations).toHaveBeenCalled();
    });
    const lastSave = savePdfAnnotations.mock.calls.at(-1)?.[0];
    expect(lastSave?.filePath).toBe(targetA);
    expect(lastSave?.annotations.bookmarks).toHaveLength(1);

    expect(
      store.set(togglePdfBookmarkForPageAtom, {
        filePath: targetA,
        pageNumber: 3,
      }),
    ).toBe("removed");
    expect(store.get(pdfAnnotationsAtom)[targetA]).toBeUndefined();
  });

  it("adds and removes highlights", async () => {
    const store = createStore();
    const created = store.set(addPdfHighlightAtom, {
      filePath: targetA,
      pageNumber: 4,
      selectedText: "quoted text",
      quads: [sampleQuad],
      color: "green",
    });

    expect(created).not.toBeNull();
    expect(created?.selectedText).toBe("quoted text");
    expect(store.get(pdfAnnotationsAtom)[targetA]?.highlights).toHaveLength(1);
    // Last used color is remembered for the selection toolbar.
    expect(store.get(pdfLastHighlightColorAtom)).toBe("green");

    if (!created) {
      return;
    }
    store.set(removePdfHighlightAtom, {
      filePath: targetA,
      highlightId: created.id,
    });
    expect(store.get(pdfAnnotationsAtom)[targetA]).toBeUndefined();
    await vi.waitFor(() => {
      expect(savePdfAnnotations.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("keeps annotations when the PDF tab is closed", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(togglePdfBookmarkForPageAtom, {
      filePath: targetA,
      pageNumber: 1,
    });
    store.set(closePdfAtom, targetA);

    expect(store.get(openPdfsAtom)).toEqual([]);
    expect(store.get(pdfAnnotationsAtom)[targetA]?.bookmarks).toHaveLength(1);
  });

  it("hydrates annotations from IPC for a path", async () => {
    loadPdfAnnotations.mockResolvedValueOnce({
      bookmarks: [{ id: "bm-1", pageNumber: 2, createdAt: 1 }],
      highlights: [],
    });
    const store = createStore();
    await store.set(hydratePdfAnnotationsAtom, targetA);

    expect(store.get(pdfAnnotationsAtom)[targetA]?.bookmarks).toEqual([
      { id: "bm-1", pageNumber: 2, createdAt: 1 },
    ]);
    expect(loadPdfAnnotations).toHaveBeenCalledWith({ filePath: targetA });
  });

  it("migrates legacy localStorage annotations into IPC storage", async () => {
    window.localStorage.setItem(
      PDF_ANNOTATIONS_KEY,
      JSON.stringify({
        [targetA]: {
          bookmarks: [{ id: "legacy-bm", pageNumber: 5, createdAt: 9 }],
          highlights: [],
        },
      }),
    );

    const store = createStore();
    await store.set(hydratePdfAnnotationsAtom, targetB);

    await vi.waitFor(() => {
      expect(savePdfAnnotations).toHaveBeenCalledWith({
        filePath: targetA,
        annotations: {
          bookmarks: [{ id: "legacy-bm", pageNumber: 5, createdAt: 9 }],
          highlights: [],
        },
      });
    });
    expect(window.localStorage.getItem(PDF_ANNOTATIONS_KEY)).toBeNull();
    expect(store.get(pdfAnnotationsAtom)[targetA]?.bookmarks).toHaveLength(1);
  });
});

describe("pdfSidePanelWidthAtom", () => {
  it("clamps and persists the side panel width", () => {
    const store = createStore();
    store.set(pdfSidePanelWidthAtom, 320);
    expect(store.get(pdfSidePanelWidthAtom)).toBe(320);
    expect(
      JSON.parse(window.localStorage.getItem(PDF_SIDE_PANEL_WIDTH_KEY) ?? "0"),
    ).toBe(320);

    store.set(pdfSidePanelWidthAtom, 40);
    expect(store.get(pdfSidePanelWidthAtom)).toBe(180);
  });
});

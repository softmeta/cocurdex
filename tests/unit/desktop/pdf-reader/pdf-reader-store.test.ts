import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeOpenPdfPathAtom,
  activePdfPathAtom,
  closePdfAtom,
  openPdfAtPageAtom,
  openPdfReaderAtom,
  openPdfsAtom,
  PDF_ACTIVE_PATH_KEY,
  PDF_OPEN_PATHS_KEY,
  PDF_READING_POSITIONS_KEY,
  PDF_SIDE_PANEL_WIDTH_KEY,
  pdfReaderRevealNonceAtom,
  pdfReadingPositionsAtom,
  pdfSidePanelWidthAtom,
  reconcileOpenPdfsWithWorkspaceRootsAtom,
  setActivePdfAtom,
  setPdfReadingPositionAtom,
} from "@/features/pdf-reader/pdf-reader-store";

const targetA = "/workspace/a.pdf";

const targetB = "/workspace/b.pdf";

const targetC = "/workspace/c.pdf";

const loadPdfAnnotations = vi.fn(async () => ({
  bookmarks: [],
  highlights: [],
}));

beforeEach(() => {
  window.localStorage.removeItem(PDF_OPEN_PATHS_KEY);
  window.localStorage.removeItem(PDF_ACTIVE_PATH_KEY);
  window.localStorage.removeItem(PDF_READING_POSITIONS_KEY);
  window.localStorage.removeItem(PDF_SIDE_PANEL_WIDTH_KEY);
  (
    window as unknown as {
      desktopApi: { loadPdfAnnotations: typeof loadPdfAnnotations };
    }
  ).desktopApi = { loadPdfAnnotations };
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

describe("reconcileOpenPdfsWithWorkspaceRootsAtom", () => {
  it("drops tabs whose workspace is gone and keeps the rest", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, targetA);
    store.set(openPdfReaderAtom, "/Users/me/my-reading/paper.pdf");
    store.set(activePdfPathAtom, "/Users/me/my-reading/paper.pdf");

    store.set(reconcileOpenPdfsWithWorkspaceRootsAtom, ["/workspace"]);

    expect(store.get(openPdfsAtom)).toEqual([targetA]);
    expect(store.get(activePdfPathAtom)).toBe(targetA);
  });

  it("clears the active path when every tab is unauthorized", () => {
    const store = createStore();
    store.set(openPdfReaderAtom, "/Users/me/my-reading/paper.pdf");

    store.set(reconcileOpenPdfsWithWorkspaceRootsAtom, ["/workspace"]);

    expect(store.get(openPdfsAtom)).toEqual([]);
    expect(store.get(activePdfPathAtom)).toBeNull();
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

import {
  applyPdfAnnotationsOperation,
  type PdfAnnotationsOperation,
  type PdfDocumentAnnotations,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPdfHighlightAtom,
  hydratePdfAnnotationsAtom,
  PDF_ANNOTATIONS_KEY,
  PDF_LAST_HIGHLIGHT_COLOR_KEY,
  pdfAnnotationsAtom,
  pdfLastHighlightColorAtom,
  removePdfHighlightAtom,
  resetPdfAnnotationsSyncStateForTests,
  togglePdfBookmarkForPageAtom,
} from "@/features/pdf-reader/pdf-annotations-store";
import {
  closePdfAtom,
  openPdfReaderAtom,
  openPdfsAtom,
} from "@/features/pdf-reader/pdf-reader-store";

const targetA = "/workspace/a.pdf";
const targetB = "/workspace/b.pdf";
const sampleQuad = { x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.25 };
const storedHighlight = {
  id: "stored",
  pageNumber: 1,
  color: "yellow" as const,
  selectedText: "stored text",
  quads: [sampleQuad],
  createdAt: 1,
};

let disk: Record<string, PdfDocumentAnnotations> = {};

const emptyDoc = (): PdfDocumentAnnotations => ({
  bookmarks: [],
  highlights: [],
});

const loadPdfAnnotations = vi.fn(
  async ({ filePath }: { filePath: string }) => disk[filePath] ?? emptyDoc(),
);
const updatePdfAnnotations = vi.fn(
  async ({
    filePath,
    operation,
  }: {
    filePath: string;
    operation: PdfAnnotationsOperation;
  }) => {
    const next = applyPdfAnnotationsOperation(
      disk[filePath] ?? emptyDoc(),
      operation,
    );
    disk = { ...disk, [filePath]: next };
    return next;
  },
);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  disk = {};
  window.localStorage.removeItem(PDF_ANNOTATIONS_KEY);
  window.localStorage.removeItem(PDF_LAST_HIGHLIGHT_COLOR_KEY);
  resetPdfAnnotationsSyncStateForTests();
  loadPdfAnnotations.mockClear();
  updatePdfAnnotations.mockClear();
  (
    window as unknown as {
      desktopApi: {
        loadPdfAnnotations: typeof loadPdfAnnotations;
        updatePdfAnnotations: typeof updatePdfAnnotations;
      };
    }
  ).desktopApi = { loadPdfAnnotations, updatePdfAnnotations };
});

describe("pdf annotations store", () => {
  it("toggles a page bookmark through daemon operations", async () => {
    const store = createStore();

    expect(
      store.set(togglePdfBookmarkForPageAtom, {
        filePath: targetA,
        pageNumber: 3,
      }),
    ).toBe("added");
    expect(store.get(pdfAnnotationsAtom)[targetA]?.bookmarks).toHaveLength(1);
    await vi.waitFor(() => expect(disk[targetA]?.bookmarks).toHaveLength(1));

    expect(
      store.set(togglePdfBookmarkForPageAtom, {
        filePath: targetA,
        pageNumber: 3,
      }),
    ).toBe("removed");
    expect(store.get(pdfAnnotationsAtom)[targetA]).toBeUndefined();
    await vi.waitFor(() => expect(disk[targetA]?.bookmarks).toEqual([]));
  });

  it("adds and removes highlights and remembers the color", async () => {
    const store = createStore();
    const created = store.set(addPdfHighlightAtom, {
      filePath: targetA,
      pageNumber: 4,
      selectedText: "quoted text",
      quads: [sampleQuad],
      color: "green",
    });

    expect(created?.selectedText).toBe("quoted text");
    expect(store.get(pdfAnnotationsAtom)[targetA]?.highlights).toHaveLength(1);
    expect(store.get(pdfLastHighlightColorAtom)).toBe("green");

    store.set(removePdfHighlightAtom, {
      filePath: targetA,
      highlightId: created?.id ?? "",
    });
    expect(store.get(pdfAnnotationsAtom)[targetA]).toBeUndefined();
    await vi.waitFor(() => expect(disk[targetA]?.highlights).toEqual([]));
  });

  it("keeps stored marks when a highlight is added after a failed load", async () => {
    disk[targetA] = { bookmarks: [], highlights: [storedHighlight] };
    loadPdfAnnotations.mockRejectedValueOnce(new Error("daemon not ready"));
    const store = createStore();
    await store.set(hydratePdfAnnotationsAtom, targetA);
    expect(store.get(pdfAnnotationsAtom)[targetA]).toBeUndefined();

    store.set(addPdfHighlightAtom, {
      filePath: targetA,
      pageNumber: 2,
      selectedText: "new text",
      quads: [sampleQuad],
    });

    await vi.waitFor(() =>
      expect(
        store.get(pdfAnnotationsAtom)[targetA]?.highlights.map((h) => h.id),
      ).toHaveLength(2),
    );
    expect(disk[targetA]?.highlights[0]?.id).toBe("stored");
  });

  it("drops a load that started before a local mutation", async () => {
    disk[targetA] = { bookmarks: [], highlights: [storedHighlight] };
    const staleLoad = deferred<PdfDocumentAnnotations>();
    loadPdfAnnotations.mockImplementationOnce(() => staleLoad.promise);
    const store = createStore();
    const hydrating = store.set(hydratePdfAnnotationsAtom, targetA);
    await vi.waitFor(() => expect(loadPdfAnnotations).toHaveBeenCalled());

    store.set(togglePdfBookmarkForPageAtom, {
      filePath: targetA,
      pageNumber: 5,
    });
    await vi.waitFor(() => expect(updatePdfAnnotations).toHaveBeenCalled());
    staleLoad.resolve({ bookmarks: [], highlights: [storedHighlight] });
    await hydrating;

    const cached = store.get(pdfAnnotationsAtom)[targetA];
    expect(cached?.bookmarks.map((b) => b.pageNumber)).toEqual([5]);
    expect(cached?.highlights.map((h) => h.id)).toEqual(["stored"]);
  });

  it("reloads from the daemon when a mutation fails", async () => {
    disk[targetA] = { bookmarks: [], highlights: [storedHighlight] };
    updatePdfAnnotations.mockRejectedValueOnce(new Error("write failed"));
    const store = createStore();

    store.set(addPdfHighlightAtom, {
      filePath: targetA,
      pageNumber: 2,
      selectedText: "lost text",
      quads: [sampleQuad],
    });

    await vi.waitFor(() =>
      expect(
        store.get(pdfAnnotationsAtom)[targetA]?.highlights.map((h) => h.id),
      ).toEqual(["stored"]),
    );
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

  it("merges legacy localStorage annotations without overwriting stored ones", async () => {
    disk[targetA] = { bookmarks: [], highlights: [storedHighlight] };
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

    expect(disk[targetA]?.highlights.map((h) => h.id)).toEqual(["stored"]);
    expect(disk[targetA]?.bookmarks.map((b) => b.id)).toEqual(["legacy-bm"]);
    expect(window.localStorage.getItem(PDF_ANNOTATIONS_KEY)).toBeNull();
  });

  it("keeps legacy annotations for a retry when migration fails", async () => {
    window.localStorage.setItem(
      PDF_ANNOTATIONS_KEY,
      JSON.stringify({
        [targetA]: {
          bookmarks: [{ id: "legacy-bm", pageNumber: 5, createdAt: 9 }],
          highlights: [],
        },
      }),
    );
    updatePdfAnnotations.mockRejectedValueOnce(new Error("daemon down"));

    const store = createStore();
    await store.set(hydratePdfAnnotationsAtom, targetB);

    expect(window.localStorage.getItem(PDF_ANNOTATIONS_KEY)).not.toBeNull();
  });
});

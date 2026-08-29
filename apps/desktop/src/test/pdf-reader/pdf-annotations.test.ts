import { describe, expect, it } from "vitest";
import {
  addBookmarkToDocument,
  addHighlightToDocument,
  createBookmark,
  createHighlight,
  EMPTY_DOCUMENT_ANNOTATIONS,
  findBookmarkForPage,
  getDocumentAnnotations,
  normalizeAnnotationsByPath,
  type PdfDocumentAnnotations,
  removeBookmarkForPage,
  removeBookmarkFromDocument,
  removeHighlightFromDocument,
  setDocumentAnnotations,
} from "@/features/pdf-reader/pdf-annotations";

const sampleQuad = { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.3 };

describe("normalizeAnnotationsByPath", () => {
  it("keeps valid bookmarks and highlights per path", () => {
    const raw = {
      "/docs/a.pdf": {
        bookmarks: [
          { id: "b1", pageNumber: 3, createdAt: 100, label: "Intro" },
        ],
        highlights: [
          {
            id: "h1",
            pageNumber: 2,
            color: "yellow",
            selectedText: "hello",
            quads: [sampleQuad],
            createdAt: 200,
          },
        ],
      },
    };

    expect(normalizeAnnotationsByPath(raw)).toEqual(raw);
  });

  it("drops invalid entries and empty documents", () => {
    expect(
      normalizeAnnotationsByPath({
        "": {
          bookmarks: [{ id: "x", pageNumber: 1, createdAt: 1 }],
          highlights: [],
        },
        "/bad.pdf": {
          bookmarks: [{ id: "", pageNumber: 1, createdAt: 1 }],
          highlights: [],
        },
        "/empty.pdf": { bookmarks: [], highlights: [] },
        "/ok.pdf": {
          bookmarks: [{ id: "b1", pageNumber: 1, createdAt: 1 }],
          highlights: [
            {
              id: "h-bad-color",
              pageNumber: 1,
              color: "red",
              selectedText: "x",
              quads: [sampleQuad],
              createdAt: 1,
            },
            {
              id: "h1",
              pageNumber: 1,
              color: "green",
              selectedText: "ok",
              quads: [sampleQuad],
              createdAt: 2,
            },
          ],
        },
      }),
    ).toEqual({
      "/ok.pdf": {
        bookmarks: [{ id: "b1", pageNumber: 1, createdAt: 1 }],
        highlights: [
          {
            id: "h1",
            pageNumber: 1,
            color: "green",
            selectedText: "ok",
            quads: [sampleQuad],
            createdAt: 2,
          },
        ],
      },
    });
  });

  it("returns empty object for non-objects", () => {
    expect(normalizeAnnotationsByPath(null)).toEqual({});
    expect(normalizeAnnotationsByPath([])).toEqual({});
    expect(normalizeAnnotationsByPath("x")).toEqual({});
  });

  it("clamps quads and scroll ratios into 0–1", () => {
    const result = normalizeAnnotationsByPath({
      "/a.pdf": {
        bookmarks: [
          {
            id: "b1",
            pageNumber: 1,
            createdAt: 1,
            scrollYRatio: 1.5,
          },
        ],
        highlights: [
          {
            id: "h1",
            pageNumber: 1,
            color: "blue",
            selectedText: "t",
            quads: [{ x1: -0.2, y1: 0.1, x2: 1.4, y2: 0.2 }],
            createdAt: 1,
          },
        ],
      },
    });

    expect(result["/a.pdf"]?.bookmarks[0]?.scrollYRatio).toBe(1);
    expect(result["/a.pdf"]?.highlights[0]?.quads[0]).toEqual({
      x1: 0,
      y1: 0.1,
      x2: 1,
      y2: 0.2,
    });
  });
});

describe("createBookmark / createHighlight", () => {
  it("creates a bookmark with defaults", () => {
    const bookmark = createBookmark({
      pageNumber: 4,
      id: "fixed-id",
      createdAt: 42,
    });
    expect(bookmark).toEqual({
      id: "fixed-id",
      pageNumber: 4,
      createdAt: 42,
    });
  });

  it("rejects invalid bookmark pages", () => {
    expect(createBookmark({ pageNumber: 0 })).toBeNull();
  });

  it("creates a highlight and defaults color to yellow", () => {
    const highlight = createHighlight({
      pageNumber: 2,
      selectedText: "  quote  ",
      quads: [sampleQuad],
      id: "h-fixed",
      createdAt: 9,
    });
    expect(highlight).toEqual({
      id: "h-fixed",
      pageNumber: 2,
      color: "yellow",
      selectedText: "  quote  ",
      quads: [sampleQuad],
      createdAt: 9,
    });
  });

  it("accepts an explicit highlight color", () => {
    const highlight = createHighlight({
      pageNumber: 1,
      selectedText: "pink note",
      quads: [sampleQuad],
      color: "pink",
      id: "h-pink",
      createdAt: 1,
    });
    expect(highlight?.color).toBe("pink");
  });

  it("rejects empty text or empty quads", () => {
    expect(
      createHighlight({
        pageNumber: 1,
        selectedText: "   ",
        quads: [sampleQuad],
      }),
    ).toBeNull();
    expect(
      createHighlight({
        pageNumber: 1,
        selectedText: "ok",
        quads: [{ x1: 0.5, y1: 0.5, x2: 0.4, y2: 0.6 }],
      }),
    ).toBeNull();
  });
});

describe("document mutation helpers", () => {
  const base: PdfDocumentAnnotations = {
    bookmarks: [
      { id: "b1", pageNumber: 2, createdAt: 1 },
      { id: "b2", pageNumber: 5, createdAt: 2 },
    ],
    highlights: [
      {
        id: "h1",
        pageNumber: 1,
        color: "yellow",
        selectedText: "a",
        quads: [sampleQuad],
        createdAt: 1,
      },
    ],
  };

  it("replaces an existing bookmark on the same page", () => {
    const next = addBookmarkToDocument(base, {
      id: "b-new",
      pageNumber: 2,
      createdAt: 10,
      label: "Revisit",
    });
    expect(next.bookmarks).toEqual([
      { id: "b-new", pageNumber: 2, createdAt: 10, label: "Revisit" },
      { id: "b2", pageNumber: 5, createdAt: 2 },
    ]);
  });

  it("removes bookmarks by id or page", () => {
    expect(removeBookmarkFromDocument(base, "b1").bookmarks).toEqual([
      { id: "b2", pageNumber: 5, createdAt: 2 },
    ]);
    expect(removeBookmarkForPage(base, 5).bookmarks).toEqual([
      { id: "b1", pageNumber: 2, createdAt: 1 },
    ]);
  });

  it("finds a bookmark for a page", () => {
    expect(findBookmarkForPage(base, 5)?.id).toBe("b2");
    expect(findBookmarkForPage(base, 9)).toBeUndefined();
  });

  it("adds and removes highlights", () => {
    const added = addHighlightToDocument(base, {
      id: "h2",
      pageNumber: 3,
      color: "green",
      selectedText: "b",
      quads: [sampleQuad],
      createdAt: 3,
    });
    expect(added.highlights.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(
      removeHighlightFromDocument(added, "h1").highlights.map((h) => h.id),
    ).toEqual(["h2"]);
  });

  it("does not duplicate highlight ids", () => {
    const existing = base.highlights[0];
    expect(existing).toBeDefined();
    if (!existing) {
      return;
    }
    const next = addHighlightToDocument(base, existing);
    expect(next).toBe(base);
  });
});

describe("setDocumentAnnotations / getDocumentAnnotations", () => {
  it("returns empty annotations for unknown paths", () => {
    expect(getDocumentAnnotations({}, "/missing.pdf")).toBe(
      EMPTY_DOCUMENT_ANNOTATIONS,
    );
  });

  it("writes, prunes empty docs, and leaves other paths alone", () => {
    const withDoc = setDocumentAnnotations({}, "/a.pdf", {
      bookmarks: [{ id: "b1", pageNumber: 1, createdAt: 1 }],
      highlights: [],
    });
    expect(withDoc["/a.pdf"]?.bookmarks).toHaveLength(1);

    const cleared = setDocumentAnnotations(withDoc, "/a.pdf", {
      bookmarks: [],
      highlights: [],
    });
    expect(cleared).toEqual({});
  });
});

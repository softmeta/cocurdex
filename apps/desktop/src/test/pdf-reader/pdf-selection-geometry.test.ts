import { describe, expect, it } from "vitest";
import type { PdfHighlight } from "@/features/pdf-reader/pdf-annotations";
import {
  clientRectToPageQuad,
  extractSelectionGeometry,
  findHighlightAtNormalizedPoint,
  findPdfPageElement,
  parsePdfPageNumber,
  pointInQuad,
} from "@/features/pdf-reader/pdf-selection-geometry";

function makeRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

describe("findPdfPageElement / parsePdfPageNumber", () => {
  it("walks up to the nearest pdf.js page root", () => {
    const page = document.createElement("div");
    page.className = "page";
    page.dataset.pageNumber = "4";
    const span = document.createElement("span");
    page.appendChild(span);
    document.body.appendChild(page);

    expect(findPdfPageElement(span)).toBe(page);
    expect(parsePdfPageNumber(page)).toBe(4);

    page.remove();
  });

  it("returns null when no page ancestor exists", () => {
    const span = document.createElement("span");
    document.body.appendChild(span);
    expect(findPdfPageElement(span)).toBeNull();
    span.remove();
  });
});

describe("clientRectToPageQuad", () => {
  const page = makeRect(100, 200, 400, 800);

  it("normalizes a rect inside the page", () => {
    expect(clientRectToPageQuad(makeRect(140, 280, 80, 40), page)).toEqual({
      x1: 0.1,
      y1: 0.1,
      x2: 0.3,
      y2: 0.15,
    });
  });

  it("returns null for empty geometry", () => {
    expect(clientRectToPageQuad(makeRect(140, 280, 0, 40), page)).toBeNull();
    expect(
      clientRectToPageQuad(makeRect(140, 280, 80, 40), makeRect(0, 0, 0, 100)),
    ).toBeNull();
  });
});

describe("extractSelectionGeometry", () => {
  it("returns page + quads for a same-page selection", () => {
    const page = document.createElement("div");
    page.className = "page";
    page.dataset.pageNumber = "2";
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => makeRect(0, 0, 200, 400),
    });

    const text = document.createTextNode("hello world");
    const span = document.createElement("span");
    span.appendChild(text);
    page.appendChild(span);
    document.body.appendChild(page);

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    // jsdom's getClientRects is often empty — stub a single line box.
    range.getClientRects = () =>
      ({
        length: 1,
        item: (index: number) =>
          index === 0 ? makeRect(10, 20, 40, 12) : null,
        [Symbol.iterator]: function* () {
          yield makeRect(10, 20, 40, 12);
        },
      }) as DOMRectList;

    expect(extractSelectionGeometry(range)).toEqual({
      pageNumber: 2,
      quads: [{ x1: 0.05, y1: 0.05, x2: 0.25, y2: 0.08 }],
    });

    page.remove();
  });

  it("returns null when the selection spans two pages", () => {
    const pageA = document.createElement("div");
    pageA.className = "page";
    pageA.dataset.pageNumber = "1";
    const textA = document.createTextNode("aaa");
    pageA.appendChild(textA);

    const pageB = document.createElement("div");
    pageB.className = "page";
    pageB.dataset.pageNumber = "2";
    const textB = document.createTextNode("bbb");
    pageB.appendChild(textB);

    document.body.append(pageA, pageB);

    const range = document.createRange();
    range.setStart(textA, 0);
    range.setEnd(textB, 3);

    expect(extractSelectionGeometry(range)).toBeNull();

    pageA.remove();
    pageB.remove();
  });
});

describe("findHighlightAtNormalizedPoint", () => {
  const highlights: PdfHighlight[] = [
    {
      id: "h1",
      pageNumber: 1,
      color: "yellow",
      selectedText: "a",
      quads: [{ x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.2 }],
      createdAt: 1,
    },
    {
      id: "h2",
      pageNumber: 1,
      color: "green",
      selectedText: "b",
      quads: [{ x1: 0.2, y1: 0.15, x2: 0.4, y2: 0.25 }],
      createdAt: 2,
    },
    {
      id: "h3",
      pageNumber: 2,
      color: "blue",
      selectedText: "c",
      quads: [{ x1: 0.5, y1: 0.5, x2: 0.6, y2: 0.6 }],
      createdAt: 3,
    },
  ];

  it("hits the topmost overlapping highlight", () => {
    expect(findHighlightAtNormalizedPoint(highlights, 1, 0.25, 0.18)?.id).toBe(
      "h2",
    );
  });

  it("returns null outside any quad or on the wrong page", () => {
    expect(findHighlightAtNormalizedPoint(highlights, 1, 0.9, 0.9)).toBeNull();
    expect(
      findHighlightAtNormalizedPoint(highlights, 3, 0.25, 0.18),
    ).toBeNull();
  });

  it("checks point-in-quad inclusively", () => {
    const quad = highlights[0]?.quads[0];
    expect(quad).toBeDefined();
    if (!quad) {
      return;
    }
    expect(pointInQuad(0.1, 0.1, quad)).toBe(true);
    expect(pointInQuad(0.09, 0.1, quad)).toBe(false);
  });

  it("honors padding for easier right-click hits", () => {
    const quad = highlights[0]?.quads[0];
    expect(quad).toBeDefined();
    if (!quad) {
      return;
    }
    expect(pointInQuad(0.09, 0.1, quad, 0.02)).toBe(true);
  });
});

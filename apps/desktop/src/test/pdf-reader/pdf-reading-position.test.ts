import { describe, expect, it } from "vitest";
import {
  normalizeOpenPaths,
  normalizeReadingPositions,
  resolveRestoredPosition,
} from "@/features/pdf-reader/pdf-reading-position";

describe("normalizeReadingPositions", () => {
  it("keeps valid path -> position entries", () => {
    expect(
      normalizeReadingPositions({
        "/docs/a.pdf": { page: 12, top: 240.5, left: 0 },
        "/docs/b.pdf": { page: 1, top: 0, left: 0 },
      }),
    ).toEqual({
      "/docs/a.pdf": { page: 12, top: 240.5, left: 0 },
      "/docs/b.pdf": { page: 1, top: 0, left: 0 },
    });
  });

  it("defaults missing or non-finite offsets to zero", () => {
    expect(
      normalizeReadingPositions({
        "/a.pdf": { page: 3 },
        "/b.pdf": { page: 4, top: Number.NaN, left: "12" },
      }),
    ).toEqual({
      "/a.pdf": { page: 3, top: 0, left: 0 },
      "/b.pdf": { page: 4, top: 0, left: 0 },
    });
  });

  it("drops invalid entries", () => {
    expect(
      normalizeReadingPositions({
        "/ok.pdf": { page: 3, top: 10, left: 0 },
        "": { page: 2, top: 0, left: 0 },
        "/zero.pdf": { page: 0, top: 0, left: 0 },
        "/float.pdf": { page: 1.5, top: 0, left: 0 },
        "/legacy.pdf": 4,
        "/null.pdf": null,
      }),
    ).toEqual({ "/ok.pdf": { page: 3, top: 10, left: 0 } });
  });

  it("returns empty object for non-objects", () => {
    expect(normalizeReadingPositions(null)).toEqual({});
    expect(normalizeReadingPositions([])).toEqual({});
    expect(normalizeReadingPositions("x")).toEqual({});
  });
});

describe("resolveRestoredPosition", () => {
  const start = { page: 1, top: 0, left: 0 };

  it("defaults to the document start when nothing is saved", () => {
    expect(resolveRestoredPosition(undefined, 10)).toEqual(start);
  });

  it("clamps to the document length and drops the stale offset", () => {
    expect(resolveRestoredPosition({ page: 50, top: 90, left: 5 }, 10)).toEqual(
      {
        page: 10,
        top: 0,
        left: 0,
      },
    );
  });

  it("keeps an in-range saved position", () => {
    expect(resolveRestoredPosition({ page: 7, top: 120, left: 8 }, 10)).toEqual(
      {
        page: 7,
        top: 120,
        left: 8,
      },
    );
  });

  it("returns the start for empty documents or invalid saves", () => {
    expect(resolveRestoredPosition({ page: 5, top: 0, left: 0 }, 0)).toEqual(
      start,
    );
    expect(resolveRestoredPosition({ page: 0, top: 0, left: 0 }, 10)).toEqual(
      start,
    );
    expect(resolveRestoredPosition({ page: 1.2, top: 0, left: 0 }, 10)).toEqual(
      start,
    );
  });
});

describe("normalizeOpenPaths", () => {
  it("dedupes and drops empties", () => {
    expect(
      normalizeOpenPaths([
        "/a.pdf",
        "",
        "/b.pdf",
        "/a.pdf",
        3,
        null,
      ] as unknown[]),
    ).toEqual(["/a.pdf", "/b.pdf"]);
  });

  it("returns empty for non-arrays", () => {
    expect(normalizeOpenPaths(null)).toEqual([]);
    expect(normalizeOpenPaths({})).toEqual([]);
  });
});

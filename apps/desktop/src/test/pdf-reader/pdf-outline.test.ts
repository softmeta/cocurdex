import { describe, expect, it, vi } from "vitest";
import {
  buildPdfOutline,
  collectExpandableOutlineKeys,
  outlineNodePathKey,
  type PdfOutlineNode,
  type PdfOutlineSource,
  type RawOutlineItem,
} from "@/features/pdf-reader/pdf-outline";

function createSource(
  outline: RawOutlineItem[] | null,
  overrides: Partial<PdfOutlineSource> = {},
): PdfOutlineSource {
  return {
    getOutline: vi.fn().mockResolvedValue(outline),
    // Named destinations resolve to an array whose first element is the page ref.
    getDestination: vi.fn(async (name: string) => [{ name }]),
    // Default: the ref object carries the resolved page index.
    getPageIndex: vi.fn(async (ref: unknown) => (ref as { page: number }).page),
    ...overrides,
  };
}

describe("buildPdfOutline", () => {
  it("returns an empty array when the document has no embedded outline", async () => {
    await expect(buildPdfOutline(createSource(null))).resolves.toEqual([]);
    await expect(buildPdfOutline(createSource([]))).resolves.toEqual([]);
  });

  it("resolves explicit destination arrays to 1-based page numbers", async () => {
    const source = createSource([
      { title: "Intro", dest: [{ page: 0 }], items: [] },
      { title: "Methods", dest: [{ page: 4 }], items: [] },
    ]);

    await expect(buildPdfOutline(source)).resolves.toEqual([
      { title: "Intro", pageNumber: 1, children: [] },
      { title: "Methods", pageNumber: 5, children: [] },
    ]);
  });

  it("resolves named destinations through getDestination", async () => {
    const source = createSource(
      [{ title: "Chapter", dest: "chapter-1", items: [] }],
      {
        getDestination: vi.fn(async () => [{ page: 9 }]),
      },
    );

    const result = await buildPdfOutline(source);

    expect(source.getDestination).toHaveBeenCalledWith("chapter-1");
    expect(result).toEqual([
      { title: "Chapter", pageNumber: 10, children: [] },
    ]);
  });

  it("records null for entries whose destination cannot be resolved", async () => {
    const source = createSource(
      [
        { title: "No link", dest: null, items: [] },
        { title: "Empty dest", dest: [], items: [] },
        { title: "Broken", dest: "missing", items: [] },
      ],
      {
        getDestination: vi.fn(async () => null),
        getPageIndex: vi.fn(async () => {
          throw new Error("bad ref");
        }),
      },
    );

    await expect(buildPdfOutline(source)).resolves.toEqual([
      { title: "No link", pageNumber: null, children: [] },
      { title: "Empty dest", pageNumber: null, children: [] },
      { title: "Broken", pageNumber: null, children: [] },
    ]);
  });

  it("maps nested child items recursively", async () => {
    const source = createSource([
      {
        title: "Part I",
        dest: [{ page: 0 }],
        items: [
          { title: "Section 1", dest: [{ page: 1 }], items: [] },
          {
            title: "Section 2",
            dest: [{ page: 2 }],
            items: [{ title: "Sub", dest: [{ page: 3 }], items: [] }],
          },
        ],
      },
    ]);

    await expect(buildPdfOutline(source)).resolves.toEqual([
      {
        title: "Part I",
        pageNumber: 1,
        children: [
          { title: "Section 1", pageNumber: 2, children: [] },
          {
            title: "Section 2",
            pageNumber: 3,
            children: [{ title: "Sub", pageNumber: 4, children: [] }],
          },
        ],
      },
    ]);
  });
});

describe("outlineNodePathKey", () => {
  it("joins parent path and index with dots", () => {
    expect(outlineNodePathKey(null, 0)).toBe("0");
    expect(outlineNodePathKey("0", 2)).toBe("0.2");
    expect(outlineNodePathKey("1.0", 3)).toBe("1.0.3");
  });
});

describe("collectExpandableOutlineKeys", () => {
  it("returns an empty list for a flat outline", () => {
    const outline: PdfOutlineNode[] = [
      { title: "A", pageNumber: 1, children: [] },
      { title: "B", pageNumber: 2, children: [] },
    ];
    expect(collectExpandableOutlineKeys(outline)).toEqual([]);
  });

  it("collects path keys for every nested node depth-first", () => {
    const outline: PdfOutlineNode[] = [
      {
        title: "Part I",
        pageNumber: 1,
        children: [
          { title: "Section 1", pageNumber: 2, children: [] },
          {
            title: "Section 2",
            pageNumber: 3,
            children: [{ title: "Sub", pageNumber: 4, children: [] }],
          },
        ],
      },
      {
        title: "Part II",
        pageNumber: 5,
        children: [{ title: "Section 3", pageNumber: 6, children: [] }],
      },
    ];

    expect(collectExpandableOutlineKeys(outline)).toEqual(["0", "0.1", "1"]);
  });
});

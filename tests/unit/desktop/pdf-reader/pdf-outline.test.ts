import { describe, expect, it, vi } from "vitest";
import {
  buildPdfOutline,
  collectExpandableOutlineKeys,
  findOutlineLocationForPage,
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

const nestedOutline: PdfOutlineNode[] = [
  {
    title: "Part I",
    pageNumber: 1,
    children: [
      { title: "Section 1", pageNumber: 2, children: [] },
      {
        title: "Section 2",
        pageNumber: 5,
        children: [{ title: "Sub", pageNumber: 7, children: [] }],
      },
    ],
  },
  {
    title: "Part II",
    pageNumber: 10,
    children: [{ title: "Section 3", pageNumber: 12, children: [] }],
  },
];

describe("findOutlineLocationForPage", () => {
  it("returns null for an empty outline or a page before the first entry", () => {
    expect(findOutlineLocationForPage([], 1)).toBeNull();
    expect(
      findOutlineLocationForPage(
        [{ title: "Later", pageNumber: 5, children: [] }],
        3,
      ),
    ).toBeNull();
  });

  it("skips entries whose destination has no page", () => {
    expect(
      findOutlineLocationForPage(
        [
          { title: "Unlinked", pageNumber: null, children: [] },
          { title: "Intro", pageNumber: 4, children: [] },
        ],
        4,
      ),
    ).toEqual({ nodeKey: "1", ancestorKeys: [] });
  });

  it("selects the last preorder entry whose page is at most the current page", () => {
    expect(findOutlineLocationForPage(nestedOutline, 1)).toEqual({
      nodeKey: "0",
      ancestorKeys: [],
    });
    expect(findOutlineLocationForPage(nestedOutline, 3)).toEqual({
      nodeKey: "0.0",
      ancestorKeys: ["0"],
    });
    expect(findOutlineLocationForPage(nestedOutline, 6)).toEqual({
      nodeKey: "0.1",
      ancestorKeys: ["0"],
    });
    expect(findOutlineLocationForPage(nestedOutline, 8)).toEqual({
      nodeKey: "0.1.0",
      ancestorKeys: ["0", "0.1"],
    });
    expect(findOutlineLocationForPage(nestedOutline, 11)).toEqual({
      nodeKey: "1",
      ancestorKeys: [],
    });
    expect(findOutlineLocationForPage(nestedOutline, 20)).toEqual({
      nodeKey: "1.0",
      ancestorKeys: ["1"],
    });
  });

  it("prefers a same-page child over its parent", () => {
    const outline: PdfOutlineNode[] = [
      {
        title: "Chapter",
        pageNumber: 1,
        children: [{ title: "Intro", pageNumber: 1, children: [] }],
      },
    ];
    expect(findOutlineLocationForPage(outline, 1)).toEqual({
      nodeKey: "0.0",
      ancestorKeys: ["0"],
    });
  });

  it("does not let an earlier-page later sibling beat a closer preceding entry", () => {
    const outline: PdfOutlineNode[] = [
      { title: "Chapter 1", pageNumber: 10, children: [] },
      { title: "Chapter 2", pageNumber: 5, children: [] },
    ];
    expect(findOutlineLocationForPage(outline, 12)).toEqual({
      nodeKey: "0",
      ancestorKeys: [],
    });
  });
});

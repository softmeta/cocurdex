// Outline (a.k.a. PDF bookmarks / table of contents) extracted from a document.
// Kept free of any `pdfjs-dist` import so it stays usable from the viewer and
// the sidebar without crossing the renderer isolation boundary.

export interface PdfOutlineNode {
  title: string;
  // 1-based page number the entry points at, or null when the destination
  // cannot be resolved to a concrete page (such entries are not clickable).
  pageNumber: number | null;
  children: PdfOutlineNode[];
}

// Minimal slice of the pdf.js `PDFDocumentProxy` the extraction needs. Declared
// structurally so this module never depends on the pdfjs types directly.
export interface PdfOutlineSource {
  getOutline(): Promise<RawOutlineItem[] | null>;
  getDestination(dest: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

export interface RawOutlineItem {
  title: string;
  // A named destination (string) or an explicit destination array whose first
  // element is the target page reference. Null when the entry has no link.
  dest?: string | unknown[] | null;
  items?: RawOutlineItem[];
}

// Resolve a single outline destination to a 1-based page number. Named
// destinations are looked up first; explicit arrays are used as-is. Any
// failure (missing ref, rejected lookup) degrades to null rather than throwing,
// so one broken bookmark never drops the whole tree.
async function resolvePageNumber(
  source: PdfOutlineSource,
  dest: RawOutlineItem["dest"],
): Promise<number | null> {
  if (dest == null) {
    return null;
  }

  try {
    const explicitDest =
      typeof dest === "string" ? await source.getDestination(dest) : dest;
    const ref = explicitDest?.[0];
    if (ref == null) {
      return null;
    }
    const pageIndex = await source.getPageIndex(ref);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

async function mapItems(
  source: PdfOutlineSource,
  items: RawOutlineItem[],
): Promise<PdfOutlineNode[]> {
  return Promise.all(
    items.map(async (item) => ({
      title: item.title,
      pageNumber: await resolvePageNumber(source, item.dest),
      children: item.items?.length ? await mapItems(source, item.items) : [],
    })),
  );
}

// Build the viewer-facing outline tree from a pdf.js document. Returns an empty
// array when the document carries no embedded bookmarks.
export async function buildPdfOutline(
  source: PdfOutlineSource,
): Promise<PdfOutlineNode[]> {
  const raw = await source.getOutline();
  if (!raw?.length) {
    return [];
  }
  return mapItems(source, raw);
}

// Stable path key for a node position in the outline tree ("0", "0.2", "1.0.3").
// Prefer path keys over content hashes so siblings with identical titles stay unique.
export function outlineNodePathKey(
  parentPath: string | null,
  index: number,
): string {
  return parentPath == null ? String(index) : `${parentPath}.${index}`;
}

// Keys of every node that has children (can expand / collapse). Depth-first.
export function collectExpandableOutlineKeys(
  nodes: PdfOutlineNode[],
  parentPath: string | null = null,
): string[] {
  const keys: string[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.children.length === 0) {
      continue;
    }
    const key = outlineNodePathKey(parentPath, index);
    keys.push(key);
    keys.push(...collectExpandableOutlineKeys(node.children, key));
  }
  return keys;
}

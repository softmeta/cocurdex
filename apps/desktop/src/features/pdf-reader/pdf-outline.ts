export interface PdfOutlineNode {
  title: string;
  pageNumber: number | null;
  children: PdfOutlineNode[];
}

export interface PdfOutlineSource {
  getOutline(): Promise<RawOutlineItem[] | null>;
  getDestination(dest: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

export interface RawOutlineItem {
  title: string;
  dest?: string | unknown[] | null;
  items?: RawOutlineItem[];
}

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

export async function buildPdfOutline(
  source: PdfOutlineSource,
): Promise<PdfOutlineNode[]> {
  const raw = await source.getOutline();
  if (!raw?.length) {
    return [];
  }
  return mapItems(source, raw);
}

export function outlineNodePathKey(
  parentPath: string | null,
  index: number,
): string {
  return parentPath == null ? String(index) : `${parentPath}.${index}`;
}

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

export interface PdfOutlineLocation {
  nodeKey: string;
  ancestorKeys: string[];
}

export function findOutlineLocationForPage(
  nodes: PdfOutlineNode[],
  pageNumber: number,
): PdfOutlineLocation | null {
  let best: PdfOutlineLocation | null = null;
  let bestPage = Number.NEGATIVE_INFINITY;

  const visit = (
    list: PdfOutlineNode[],
    parentPath: string | null,
    ancestorKeys: string[],
  ) => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      const nodeKey = outlineNodePathKey(parentPath, index);
      if (
        node.pageNumber != null &&
        node.pageNumber <= pageNumber &&
        node.pageNumber >= bestPage
      ) {
        bestPage = node.pageNumber;
        best = { nodeKey, ancestorKeys };
      }
      if (node.children.length > 0) {
        visit(node.children, nodeKey, [...ancestorKeys, nodeKey]);
      }
    }
  };

  visit(nodes, null, []);
  return best;
}

import type { WorkspaceSearchMatch } from "@/lib/types";

// Flat row model for the virtualized results list. The grouped
// header/children tree is flattened into a single array so the virtualizer
// can index every visible line uniformly.
export type SearchResultRow =
  | {
      kind: "header";
      filePath: string;
      relativePath: string;
      matchCount: number;
    }
  | {
      kind: "match";
      filePath: string;
      match: WorkspaceSearchMatch;
      matchIndex: number;
    };

function getRelativePath(rootPath: string | null, filePath: string) {
  if (!rootPath || !filePath.startsWith(rootPath)) {
    return filePath;
  }

  return filePath.slice(rootPath.length).replace(/^[/\\]/, "");
}

// Build the flat row list. Collapsed files contribute only their header.
export function buildSearchResultRows(
  entries: [string, WorkspaceSearchMatch[]][],
  rootPath: string | null,
  collapsedPaths: Set<string>,
): SearchResultRow[] {
  const rows: SearchResultRow[] = [];

  for (const [filePath, matches] of entries) {
    rows.push({
      filePath,
      kind: "header",
      matchCount: matches.length,
      relativePath: getRelativePath(rootPath, filePath),
    });

    if (collapsedPaths.has(filePath)) {
      continue;
    }

    matches.forEach((match, matchIndex) => {
      rows.push({ filePath, kind: "match", match, matchIndex });
    });
  }

  return rows;
}

// Indexes of every header row, used by the sticky range extractor to keep the
// current file header pinned to the top of the viewport.
export function getHeaderIndexes(rows: SearchResultRow[]): number[] {
  const indexes: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "header") {
      indexes.push(index);
    }
  });
  return indexes;
}

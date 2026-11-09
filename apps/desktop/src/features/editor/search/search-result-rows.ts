import type { WorkspaceSearchMatch } from "@/lib/types";

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

export function getHeaderIndexes(rows: SearchResultRow[]): number[] {
  const indexes: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "header") {
      indexes.push(index);
    }
  });
  return indexes;
}

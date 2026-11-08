import type { WorkspaceFileEntry } from "@/lib";

const MATCH_WEIGHT = {
  "exact-path": 7,
  "exact-name": 6,
  "path-prefix": 5,
  "ancestor-segment": 4,
  "name-prefix": 3,
  "name-contains": 2,
  "path-contains": 1,
} as const;

const BAND = 1000;
const DIRECTORY_BONUS = 100;

type MatchKind = keyof typeof MATCH_WEIGHT;

export function rankWorkspaceEntries(
  files: WorkspaceFileEntry[],
  query: string,
): WorkspaceFileEntry[] {
  const scored: Array<{ file: WorkspaceFileEntry; score: number }> = [];
  for (const file of files) {
    const score = scoreWorkspaceEntry(file, query);
    if (score > 0) {
      scored.push({ file, score });
    }
  }
  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.file.relativePath.localeCompare(right.file.relativePath);
  });
  return scored.map(({ file }) => file);
}

export function scoreWorkspaceEntry(
  file: WorkspaceFileEntry,
  query: string,
): number {
  const lowerQuery = normalizeQuery(query);
  if (lowerQuery.length === 0) {
    return 0;
  }

  const kind = matchKind(file, lowerQuery);
  if (!kind) {
    return 0;
  }

  const depth = normalizePath(file.relativePath)
    .split("/")
    .filter(Boolean).length;
  const directoryBonus = file.kind === "directory" ? DIRECTORY_BONUS : 0;
  return MATCH_WEIGHT[kind] * BAND + directoryBonus - depth;
}

export function getEntryName(file: WorkspaceFileEntry): string {
  return file.name ?? file.relativePath.split("/").pop() ?? file.relativePath;
}

export function findMatchRange(
  text: string,
  query: string,
): [number, number] | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index < 0) {
    return null;
  }
  return [index, index + trimmed.length];
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\/+$/, "");
}

function normalizePath(relativePath: string): string {
  return relativePath
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function matchKind(file: WorkspaceFileEntry, query: string): MatchKind | null {
  const path = normalizePath(file.relativePath);
  const fileName = getEntryName(file).toLowerCase();
  const segments = path.split("/").filter(Boolean);

  if (path === query) {
    return "exact-path";
  }
  if (fileName === query) {
    return "exact-name";
  }
  if (isPathPrefixMatch(path, query)) {
    return "path-prefix";
  }
  if (segments.slice(0, -1).includes(query)) {
    return "ancestor-segment";
  }
  if (fileName.startsWith(query)) {
    return "name-prefix";
  }
  if (fileName.includes(query)) {
    return "name-contains";
  }
  if (path.includes(query)) {
    return "path-contains";
  }
  return null;
}

function isPathPrefixMatch(path: string, query: string): boolean {
  if (path.startsWith(`${query}/`)) {
    return true;
  }
  return query.includes("/") && path.startsWith(query);
}

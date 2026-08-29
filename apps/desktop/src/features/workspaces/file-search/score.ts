import type { WorkspaceFileEntry } from "@/lib";

// 匹配档位，数字越大越靠前。目录加分和深度只在同一档内排序，
// 避免文件名子串压过路径前缀命中。
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

// 越高越靠前。0 表示未命中，调用方丢弃该条目。
//
// `@apps` 按路径前缀理解：先是该名字的节点，再是其下子树。
// 文件名偶然命中（如 `apps-desktop-src-….md`）排在子树之后。
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

// 文本中查询串的第一处大小写不敏感命中区间；未命中返回 null。
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
  // 正在输入带斜杠的路径时，最后一段可以是前缀（`apps/de` → `apps/desktop`）。
  return query.includes("/") && path.startsWith(query);
}

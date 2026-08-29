// Pure helper for the breadcrumb directory popover. The workspace exposes a
// flat list of file/directory entries; clicking a breadcrumb segment opens a
// @pierre/trees file tree rooted at that directory, which expects a flat list
// of paths *relative to that directory*.

export interface SubtreeEntry {
  kind?: "directory" | "file";
  relativePath: string;
}

export interface BreadcrumbTreeTarget {
  dirPath: string;
  selectedPath: string;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getBreadcrumbTreeTarget(
  segments: string[],
  index: number,
): BreadcrumbTreeTarget {
  const dirPath = segments.slice(0, index).join("/");
  const segment = segments[index] ?? "";
  const isFileSegment = index === segments.length - 1;

  return {
    dirPath,
    selectedPath: isFileSegment ? segment : `${segment}/`,
  };
}

export function resolveBreadcrumbSelectedFilePath(
  rootPath: string,
  dirPath: string,
  selectedPath: string,
): string | null {
  if (!selectedPath || selectedPath.endsWith("/")) return null;
  const dirPrefix = dirPath ? `${stripTrailingSlash(dirPath)}/` : "";
  return `${rootPath}/${dirPrefix}${selectedPath}`;
}

/**
 * Crop a flat entry list down to the file paths that live under `dirPath`,
 * rebased so they are relative to `dirPath`.
 *
 * `dirPath` is a workspace-relative directory ("" = workspace root, "src/db" =
 * a nested directory). Directory records are dropped because @pierre/trees
 * infers directory nodes from the file paths themselves — passing explicit
 * directory entries would duplicate them (mirrors file-tree.tsx's
 * `entriesToPaths`).
 */
export function getSubtreePaths(
  entries: SubtreeEntry[],
  dirPath: string,
): string[] {
  const prefix = dirPath ? `${stripTrailingSlash(dirPath)}/` : "";
  const paths: string[] = [];

  for (const entry of entries) {
    if (entry.kind === "directory") continue;
    const rel = entry.relativePath;
    if (prefix && !rel.startsWith(prefix)) continue;
    const rest = rel.slice(prefix.length);
    if (!rest) continue;
    paths.push(rest);
  }

  return paths;
}

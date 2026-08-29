import type { UseFileTreeResult } from "@pierre/trees/react";

type FileTreeModel = UseFileTreeResult["model"];

// Session-scoped expansion memory keyed by workspace root. Survives FileTree
// remounts (view tab switches, search/explorer toggles) without localStorage.
const expandedPathsByRoot = new Map<string, readonly string[]>();
// Synthetic workspace-root row (outside Pierre): open by default.
const rootExpandedByRoot = new Map<string, boolean>();

export function getFileTreeExpandedPaths(rootPath: string): readonly string[] {
  return expandedPathsByRoot.get(rootPath) ?? [];
}

export function setFileTreeExpandedPaths(
  rootPath: string,
  paths: readonly string[],
): void {
  if (paths.length === 0) {
    expandedPathsByRoot.delete(rootPath);
    return;
  }
  expandedPathsByRoot.set(rootPath, paths);
}

export function getFileTreeRootExpanded(rootPath: string): boolean {
  return rootExpandedByRoot.get(rootPath) ?? true;
}

export function setFileTreeRootExpanded(
  rootPath: string,
  expanded: boolean,
): void {
  rootExpandedByRoot.set(rootPath, expanded);
}

// Test helper / workspace switch cleanup.
export function clearFileTreeExpandedPaths(rootPath?: string): void {
  if (rootPath == null) {
    expandedPathsByRoot.clear();
    rootExpandedByRoot.clear();
    return;
  }
  expandedPathsByRoot.delete(rootPath);
  rootExpandedByRoot.delete(rootPath);
}

// Every directory prefix implied by the listing (including empty dirs that
// already end with `/`). Used both to snapshot expansion and to know which
// getItem() handles can be queried.
export function collectDirectoryPaths(filePaths: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const path of filePaths) {
    const isDirectory = path.endsWith("/");
    const normalized = isDirectory ? path.slice(0, -1) : path;
    if (normalized.length === 0) continue;
    const segments = normalized.split("/");
    // Files contribute ancestor dirs only; directory entries also include self.
    const depth = isDirectory ? segments.length : segments.length - 1;
    for (let i = 1; i <= depth; i++) {
      dirs.add(`${segments.slice(0, i).join("/")}/`);
    }
  }
  return [...dirs];
}

// Read currently expanded folders from the live Pierre model.
export function collectExpandedDirectoryPaths(
  model: FileTreeModel,
  filePaths: readonly string[],
): string[] {
  const expanded: string[] = [];
  for (const directoryPath of collectDirectoryPaths(filePaths)) {
    const item = model.getItem(directoryPath);
    // Directory handles expose isExpanded; the union does not narrow via
    // isDirectory() alone in this package's typings.
    if (item != null && "isExpanded" in item && item.isExpanded()) {
      expanded.push(directoryPath);
    }
  }
  // Pierre's initializeExpandedPaths is faster when paths arrive sorted.
  expanded.sort((left, right) => left.localeCompare(right));
  return expanded;
}

// Prefer live model state (same mount, path refresh); fall back to the
// session cache (remount after a tab switch).
export function resolveExpandedPathsForReset(
  liveExpanded: readonly string[],
  storedExpanded: readonly string[],
): readonly string[] | undefined {
  if (liveExpanded.length > 0) return liveExpanded;
  if (storedExpanded.length > 0) return storedExpanded;
  return undefined;
}

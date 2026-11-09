import type { UseFileTreeResult } from "@pierre/trees/react";

type FileTreeModel = UseFileTreeResult["model"];

const expandedPathsByRoot = new Map<string, readonly string[]>();
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

export function clearFileTreeExpandedPaths(rootPath?: string): void {
  if (rootPath == null) {
    expandedPathsByRoot.clear();
    rootExpandedByRoot.clear();
    return;
  }
  expandedPathsByRoot.delete(rootPath);
  rootExpandedByRoot.delete(rootPath);
}

export function collectDirectoryPaths(filePaths: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const path of filePaths) {
    const isDirectory = path.endsWith("/");
    const normalized = isDirectory ? path.slice(0, -1) : path;
    if (normalized.length === 0) continue;
    const segments = normalized.split("/");
    const depth = isDirectory ? segments.length : segments.length - 1;
    for (let i = 1; i <= depth; i++) {
      dirs.add(`${segments.slice(0, i).join("/")}/`);
    }
  }
  return [...dirs];
}

export function collectExpandedDirectoryPaths(
  model: FileTreeModel,
  filePaths: readonly string[],
): string[] {
  const expanded: string[] = [];
  for (const directoryPath of collectDirectoryPaths(filePaths)) {
    const item = model.getItem(directoryPath);
    if (item != null && "isExpanded" in item && item.isExpanded()) {
      expanded.push(directoryPath);
    }
  }
  expanded.sort((left, right) => left.localeCompare(right));
  return expanded;
}

export function withAncestorDirectories(
  directoryPaths: readonly string[],
): string[] {
  const paths = new Set<string>();
  for (const directoryPath of directoryPaths) {
    const segments = directoryPath.split("/").filter(Boolean);
    for (let depth = 1; depth <= segments.length; depth++) {
      paths.add(`${segments.slice(0, depth).join("/")}/`);
    }
  }
  return [...paths];
}

export function resolveExpandedPathsForReset(
  liveExpanded: readonly string[],
  storedExpanded: readonly string[],
): readonly string[] | undefined {
  if (liveExpanded.length > 0) return liveExpanded;
  if (storedExpanded.length > 0) return storedExpanded;
  return undefined;
}

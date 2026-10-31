import type { WorkspaceFileEntry } from "@/lib";

export type LoadedDirectoryChildren = ReadonlyMap<
  string,
  readonly WorkspaceFileEntry[]
>;

function childDirectoryKey(directoryPath: string, loadedPath: string) {
  const rest = loadedPath.slice(directoryPath.length);
  const separator = rest.indexOf("/");
  return `${directoryPath}${rest.slice(0, separator + 1)}`;
}

export function withDirectoryChildren(
  current: LoadedDirectoryChildren | null,
  directoryPath: string,
  entries: readonly WorkspaceFileEntry[] | null,
): LoadedDirectoryChildren {
  const listedDirectories = new Set(
    (entries ?? [])
      .filter((entry) => entry.kind === "directory")
      .map((entry) => `${entry.relativePath}/`),
  );
  const next = new Map<string, readonly WorkspaceFileEntry[]>();
  for (const [loadedPath, children] of current ?? []) {
    const isDescendant =
      loadedPath !== directoryPath && loadedPath.startsWith(directoryPath);
    const isStale =
      loadedPath === directoryPath ||
      (isDescendant &&
        !listedDirectories.has(childDirectoryKey(directoryPath, loadedPath)));
    if (!isStale) {
      next.set(loadedPath, children);
    }
  }
  if (entries) {
    next.set(directoryPath, entries);
  }
  return next;
}

export function mergeLoadedDirectories(
  base: readonly WorkspaceFileEntry[],
  loaded: LoadedDirectoryChildren | null,
): readonly WorkspaceFileEntry[] {
  if (!loaded || loaded.size === 0) {
    return base;
  }
  const known = new Set(base.map((entry) => entry.relativePath));
  const missing: WorkspaceFileEntry[] = [];
  for (const children of loaded.values()) {
    for (const entry of children) {
      if (!known.has(entry.relativePath)) {
        known.add(entry.relativePath);
        missing.push(entry);
      }
    }
  }
  return missing.length === 0 ? base : [...base, ...missing];
}

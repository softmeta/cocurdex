export interface FileTreeContextTarget {
  relativePath: string;
  isDirectory: boolean;
}

export function resolveFileTreeContextTarget(
  rowPath: string | undefined,
): FileTreeContextTarget | null {
  if (rowPath === undefined) {
    return null;
  }
  return {
    relativePath: rowPath,
    isDirectory: rowPath === "" || rowPath.endsWith("/"),
  };
}

export function resolveFileTreeTargetPaths(
  rootPath: string,
  targetRelativePath: string,
): { relativePath: string; absolutePath: string } {
  const relativePath = targetRelativePath.replace(/\/$/, "");
  return {
    relativePath,
    absolutePath: relativePath ? `${rootPath}/${relativePath}` : rootPath,
  };
}

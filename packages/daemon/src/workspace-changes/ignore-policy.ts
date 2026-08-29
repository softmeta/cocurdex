const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

const IGNORED_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

export function isIgnoredWorkspacePath(relativePath: string) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) {
    return true;
  }

  if (parts.some((part) => IGNORED_DIRECTORY_NAMES.has(part))) {
    return true;
  }

  const basename = parts[parts.length - 1] ?? "";
  const lowerName = basename.toLowerCase();
  if (IGNORED_FILE_NAMES.has(lowerName)) {
    return true;
  }

  return isOfficeTransientFile(basename);
}

export function isOfficeTransientFile(basename: string) {
  if (basename.startsWith("~$")) {
    return true;
  }
  if (basename.startsWith(".~lock.") && basename.endsWith("#")) {
    return true;
  }
  return false;
}

export function isIgnoredDirectoryName(name: string) {
  return IGNORED_DIRECTORY_NAMES.has(name);
}

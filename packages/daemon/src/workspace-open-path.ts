import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { stripTrailingPathSeparators } from "@cocurdex/shared";

function normalizeForCompare(rootPath: string): string {
  const trimmed = stripTrailingPathSeparators(rootPath) || rootPath;
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

async function canonicalDirectory(directoryPath: string) {
  try {
    return await realpath(directoryPath);
  } catch {
    return directoryPath;
  }
}

async function matchExistingRootPath(
  directoryPath: string,
  existingRootPaths: string[],
) {
  const resolvedKey = normalizeForCompare(directoryPath);
  for (const rootPath of existingRootPaths) {
    if (normalizeForCompare(rootPath) === resolvedKey) {
      return rootPath;
    }
  }
  for (const rootPath of existingRootPaths) {
    try {
      const real = await realpath(path.resolve(rootPath));
      if (normalizeForCompare(real) === resolvedKey) {
        return rootPath;
      }
    } catch {}
  }
  return directoryPath;
}

export async function resolveWorkspaceOpenPath(
  inputPath: string,
  existingRootPaths: string[],
  options: { allowFile: boolean },
): Promise<string | null> {
  const resolved = path.resolve(inputPath);
  let directoryPath: string;
  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      directoryPath = resolved;
    } else if (stats.isFile() && options.allowFile) {
      directoryPath = path.dirname(resolved);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  return matchExistingRootPath(
    await canonicalDirectory(directoryPath),
    existingRootPaths,
  );
}

import { realpath, stat } from "node:fs/promises";
import path from "node:path";

function normalizeForCompare(rootPath: string): string {
  const trimmed = rootPath.replace(/[\\/]+$/, "") || rootPath;
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

async function canonicalDirectory(directoryPath: string) {
  try {
    return await realpath(directoryPath);
  } catch {
    return directoryPath;
  }
}

// Map a directory onto an existing workspace's stored rootPath when they are
// the same directory (including symlink / realpath differences), so opening
// it reuses that project instead of creating a duplicate.
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

// Resolve a user-supplied path (CLI argument or a drop onto the window) into
// the workspace root to open. With allowFile, a file opens its parent
// directory. Returns null for a missing or unusable path.
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

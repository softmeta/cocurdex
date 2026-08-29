import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { BrowserWindow } from "electron";

export const OPEN_FOLDER_FLAG = "--open-folder";

const OPEN_FROM_CLI_CHANNEL = "workspace:openFromCli";

export type OpenFolderAdditionalData = {
  openFolder?: string;
};

let pendingOpenFolder: string | null = null;

/**
 * Parse `--open-folder <path>` or `--open-folder=<path>` from argv.
 * Packaged second-instance argv order can shuffle; prefer additionalData when
 * available (see requestSingleInstanceLock).
 */
export function extractOpenFolderFromArgv(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith(`${OPEN_FOLDER_FLAG}=`)) {
      const value = arg.slice(OPEN_FOLDER_FLAG.length + 1);
      if (value) {
        return path.resolve(value);
      }
    }
  }

  const flagIndex = argv.indexOf(OPEN_FOLDER_FLAG);
  if (flagIndex < 0) {
    return null;
  }
  const value = argv[flagIndex + 1];
  if (!value || value.startsWith("-")) {
    return null;
  }
  return path.resolve(value);
}

/** Prefer Electron switch parsing, fall back to raw argv. */
export function extractOpenFolderFromProcess(
  argv: string[] = process.argv,
): string | null {
  return extractOpenFolderFromArgv(argv);
}

export function extractOpenFolderFromAdditionalData(
  additionalData: unknown,
): string | null {
  if (!additionalData || typeof additionalData !== "object") {
    return null;
  }
  const value = (additionalData as OpenFolderAdditionalData).openFolder;
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return path.resolve(value);
}

export async function validateOpenFolderPath(
  folderPath: string,
): Promise<string> {
  const resolved = path.resolve(folderPath);
  await access(resolved);
  const stats = await stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  // realpath so symlink ///private/var forms match an existing workspace.
  try {
    return await realpath(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Resolve a path dropped onto the window (or otherwise supplied as a local
 * FS path) into a workspace root. Directories open as-is; files open their
 * parent directory so dragging a file from Finder still lands in that project.
 * Returns null when the path is missing or not a usable directory.
 */
export async function resolveDroppedOpenPath(
  inputPath: string,
  existingRootPaths: string[] = [],
): Promise<string | null> {
  const resolved = path.resolve(inputPath);
  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      return resolveWorkspaceRootPathForOpen(resolved, existingRootPaths);
    }
    if (stats.isFile()) {
      return resolveWorkspaceRootPathForOpen(
        path.dirname(resolved),
        existingRootPaths,
      );
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeForCompare(rootPath: string): string {
  const trimmed = rootPath.replace(/[\\/]+$/, "") || rootPath;
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

/**
 * Map a CLI path onto an existing workspace's stored rootPath when they are
 * the same directory (including symlink / realpath differences). Keeps the
 * renderer from creating a duplicate project and failing to check the
 * WorkspacePicker row.
 */
export async function resolveWorkspaceRootPathForOpen(
  folderPath: string,
  existingRootPaths: string[],
): Promise<string> {
  const resolved = await validateOpenFolderPath(folderPath);
  const resolvedKey = normalizeForCompare(resolved);

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
    } catch {
      // skip missing / unreadable roots
    }
  }

  return resolved;
}

/**
 * Queue a folder open. Set `broadcast` false on cold start so the renderer
 * applies the path after bootstrap (avoids racing bootstrapWorkspaces).
 * Second-instance opens leave broadcast on (default) for live windows.
 *
 * `existingRootPaths` lets us reopen the same project identity the picker uses.
 */
export async function queueOpenFolder(
  folderPath: string,
  options?: { broadcast?: boolean; existingRootPaths?: string[] },
): Promise<string> {
  const rootPath = await resolveWorkspaceRootPathForOpen(
    folderPath,
    options?.existingRootPaths ?? [],
  );
  pendingOpenFolder = rootPath;
  if (options?.broadcast === false) {
    return rootPath;
  }
  broadcastOpenFolder(rootPath);
  return rootPath;
}

export function getPendingOpenFolder(): string | null {
  return pendingOpenFolder;
}

/**
 * Return and clear the pending path so cold-start bootstrap can apply it once.
 * Live windows also receive `workspace:openFromCli` push events.
 */
export function consumePendingOpenFolder(): string | null {
  const value = pendingOpenFolder;
  pendingOpenFolder = null;
  return value;
}

export function broadcastOpenFolder(rootPath: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(OPEN_FROM_CLI_CHANNEL, { rootPath });
  }
}

export function focusMainWindow(): void {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  const window = windows[0];
  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

export { OPEN_FROM_CLI_CHANNEL };

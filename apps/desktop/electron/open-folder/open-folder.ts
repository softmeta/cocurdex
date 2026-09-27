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

export function queueOpenFolder(
  rootPath: string,
  options?: { broadcast?: boolean },
): void {
  pendingOpenFolder = rootPath;
  if (options?.broadcast !== false) {
    broadcastOpenFolder(rootPath);
  }
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

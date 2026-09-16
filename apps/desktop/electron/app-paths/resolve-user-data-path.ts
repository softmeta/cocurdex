import { COCURDEX_USER_DATA_PATH_ENV } from "@cocurdex/daemon/paths";

/**
 * Resolve the userData directory so local development never shares persisted
 * state (SQLite database, attachments, workspace checkpoints, IndexedDB,
 * cookies) with an installed/packaged build.
 *
 * COCURDEX_USER_DATA_PATH wins for every build flavor so tests and tools can
 * fully isolate the app and the daemon it spawns. Otherwise dev and packaged
 * builds resolve `app.getName()` to the same value, so Electron's default
 * userData path collides. Dev runs get a dedicated `-dev` directory; packaged
 * builds keep the default path untouched.
 */
export function resolveUserDataPath(
  defaultUserDataPath: string,
  isPackaged: boolean,
): string {
  const configured = process.env[COCURDEX_USER_DATA_PATH_ENV]?.trim();
  if (configured) {
    return configured;
  }
  if (isPackaged) {
    return defaultUserDataPath;
  }
  return `${defaultUserDataPath}-dev`;
}
